// 관리자 DB 도구에서 공개 테이블을 선택·필터·정렬·내보내기한다.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, ExternalLink, Plus, RefreshCw, Search, X } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { getAdminAuthHeaders } from '@/lib/adminAuth';
import type { DbColumn } from '@/lib/dbBrowserTypes';

type TableSummary = { table: string; columnCount: number };
type DbRow = Record<string, unknown>;
type Notice = { type: 'success' | 'error'; text: string } | null;
type SortState = { column: string; direction: 'asc' | 'desc' };

const TABLE_DESCRIPTIONS: Record<string, string> = {
  rentcar_price: '렌트카 요금표', reservation: '예약 기본 정보', users: '사용자 계정',
  cruise_info: '크루즈 상품 정보', cruise_rate_card: '크루즈 요금표', hotel_info: '호텔 정보',
  hotel_price: '호텔 객실 요금', airport_price: '공항 이동 요금', tour: '투어 상품',
  ticket_price: '티켓 요금', quote: '견적서', quote_item: '견적 항목',
  payment_info: '결제 정보', notifications: '알림 발송 기록', push_subscriptions: '푸시 구독 정보',
};

const WORD_LABELS: Record<string, string> = {
  reservation: '예약', cruise: '크루즈', rentcar: '렌트카', airport: '공항', hotel: '호텔',
  tour: '투어', ticket: '티켓', price: '요금', payment: '결제', user: '사용자', users: '사용자',
  notification: '알림', notifications: '알림', customer: '고객', manager: '관리자', booking: '예약',
  quote: '견적', partner: '제휴사', request: '요청', history: '이력', backup: '백업', archive: '보관',
  status: '상태', log: '기록', document: '문서', image: '이미지', images: '이미지', schedule: '일정', promotion: '프로모션',
};

function describeTable(table: string) {
  if (TABLE_DESCRIPTIONS[table]) return TABLE_DESCRIPTIONS[table];
  if (table.startsWith('_archive_') || table.startsWith('_backup_') || table.includes('_backup')) return '운영 데이터 보관·백업';
  if (table.startsWith('v_') || table.endsWith('_view')) return '운영 조회용 보기';
  const words = table.split('_').map((word) => WORD_LABELS[word]).filter(Boolean);
  return words.length > 0 ? `${words.slice(0, 3).join(' · ')} 데이터` : '운영 데이터';
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function inputType(column: DbColumn) {
  if (column.data_type.includes('int') || column.data_type === 'numeric' || column.data_type === 'double precision' || column.data_type === 'real') return 'number';
  if (column.data_type === 'date') return 'date';
  if (column.data_type.includes('timestamp')) return 'datetime-local';
  return 'text';
}

function parseValue(column: DbColumn, value: string): unknown {
  if (value === '') return null;
  if (column.data_type === 'json' || column.data_type === 'jsonb') {
    try { return JSON.parse(value); } catch { throw new Error(`${column.column_name} JSON 형식을 확인해 주세요.`); }
  }
  if (column.data_type === 'boolean') return value === 'true';
  if (column.data_type.includes('int') || column.data_type === 'numeric' || column.data_type === 'double precision' || column.data_type === 'real') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${column.column_name} 숫자 형식을 확인해 주세요.`);
    return number;
  }
  return value;
}

export default function DatabaseManagementPage() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [rowSearch, setRowSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [sort, setSort] = useState<SortState>({ column: '', direction: 'asc' });
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [horizontalScroll, setHorizontalScroll] = useState({ visible: false, contentWidth: 0, viewportWidth: 0, left: 0 });
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const bottomScrollbarRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);

  const authHeaders = useCallback(() => getAdminAuthHeaders(), []);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const response = await fetch('/api/admin/db-browser?mode=tables', { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '테이블 목록을 불러오지 못했습니다.');
      const nextTables = Array.isArray(result.tables) ? result.tables as TableSummary[] : [];
      setTables(nextTables);
      setSelectedTable((current) => current && nextTables.some((item) => item.table === current) ? current : nextTables[0]?.table || '');
    } catch (error: unknown) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : '테이블 목록을 불러오지 못했습니다.' });
    } finally {
      setLoadingTables(false);
    }
  }, [authHeaders]);

  const loadRows = useCallback(async (table: string, search: string, filters: Record<string, string>, nextSort: SortState, nextPage: number) => {
    if (!table) return;
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({ mode: 'rows', table, search, filters: JSON.stringify(filters), sort: nextSort.column, direction: nextSort.direction, offset: String(nextPage * 100), limit: '100' });
      const response = await fetch(`/api/admin/db-browser?${params}`, { headers: await authHeaders(), cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '테이블 행을 불러오지 못했습니다.');
      setColumns(Array.isArray(result.columns) ? result.columns : []);
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setTotalRows(Number(result.count || 0));
      setHasMore(Boolean(result.hasMore));
      setPage(nextPage);
    } catch (error: unknown) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : '테이블 행을 불러오지 못했습니다.' });
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [authHeaders]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  useEffect(() => {
    if (!selectedTable) return;
    const timer = window.setTimeout(() => { void loadRows(selectedTable, rowSearch, columnFilters, sort, 0); }, 300);
    return () => window.clearTimeout(timer);
  }, [columnFilters, loadRows, rowSearch, selectedTable, sort]);

  const visibleColumns = useMemo(() => columns.filter((column) => !hiddenColumns.includes(column.column_name)), [columns, hiddenColumns]);
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const column of columns) {
      const values = new Set<string>();
      for (const row of rows) {
        const value = formatValue(row[column.column_name]);
        if (value !== '-' && value.length <= 120) values.add(value);
        if (values.size >= 80) break;
      }
      options[column.column_name] = [...values].sort((a, b) => a.localeCompare(b, 'ko'));
    }
    return options;
  }, [columns, rows]);

  const measureHorizontalScroll = useCallback(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setHorizontalScroll({ visible: viewport.scrollWidth > viewport.clientWidth + 1, contentWidth: viewport.scrollWidth, viewportWidth: viewport.clientWidth, left: rect.left });
  }, []);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const refreshHorizontalScroll = () => window.requestAnimationFrame(measureHorizontalScroll);
    refreshHorizontalScroll();
    const observer = new ResizeObserver(measureHorizontalScroll);
    observer.observe(viewport);
    window.addEventListener('resize', refreshHorizontalScroll);
    window.visualViewport?.addEventListener('resize', refreshHorizontalScroll);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refreshHorizontalScroll);
      window.visualViewport?.removeEventListener('resize', refreshHorizontalScroll);
    };
  }, [measureHorizontalScroll, rows, visibleColumns]);

  const syncFromTable = () => {
    const viewport = tableViewportRef.current;
    const bottom = bottomScrollbarRef.current;
    if (!viewport || !bottom || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    bottom.scrollLeft = viewport.scrollLeft;
    syncingScrollRef.current = false;
  };
  const syncFromBottom = () => {
    const viewport = tableViewportRef.current;
    const bottom = bottomScrollbarRef.current;
    if (!viewport || !bottom || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    viewport.scrollLeft = bottom.scrollLeft;
    syncingScrollRef.current = false;
  };

  const selectTable = (table: string) => {
    setSelectedTable(table);
    setRowSearch('');
    setColumnFilters({});
    setHiddenColumns([]);
    setSort({ column: '', direction: 'asc' });
    setPage(0);
    setNotice(null);
  };
  const toggleSort = (column: string) => setSort((current) => current.column === column ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' });
  const updateColumnFilter = (column: string, value: string) => setColumnFilters((current) => ({ ...current, [column]: value }));
  const toggleColumn = (column: string) => setHiddenColumns((current) => current.includes(column) ? current.filter((name) => name !== column) : visibleColumns.length <= 1 ? current : [...current, column]);

  const openAdd = () => {
    const initial: Record<string, string> = {};
    columns.forEach((column) => { initial[column.column_name] = column.data_type === 'boolean' ? 'false' : ''; });
    setForm(initial);
    setAddOpen(true);
  };

  const addRow = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const values: Record<string, unknown> = {};
      for (const column of columns) {
        const raw = form[column.column_name] ?? '';
        if (raw !== '') values[column.column_name] = parseValue(column, raw);
        if (column.is_nullable === 'NO' && !column.column_default && !column.identity_generation && raw === '') throw new Error(`${column.column_name}은(는) 필수입니다.`);
      }
      const response = await fetch('/api/admin/db-browser', { method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ table: selectedTable, values }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '행 추가에 실패했습니다.');
      setAddOpen(false);
      setNotice({ type: 'success', text: `${selectedTable} 테이블에 행을 추가했습니다.` });
      await loadRows(selectedTable, rowSearch, columnFilters, sort, 0);
    } catch (error: unknown) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : '행 추가에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const exportTable = async () => {
    const sheetWindow = window.open('about:blank', '_blank');
    setExporting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/sheets-sync', { method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'table', table: selectedTable, search: rowSearch, filters: columnFilters, sort: sort.column, direction: sort.direction }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '구글시트 내보내기에 실패했습니다.');
      const sheet = result.sheets?.[0];
      const spreadsheetId = typeof result.spreadsheetId === 'string' ? result.spreadsheetId : '';
      const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit` : '';
      if (sheetUrl && sheetWindow) sheetWindow.location.replace(sheetUrl);
      else if (sheetUrl) window.open(sheetUrl, '_blank', 'noopener,noreferrer');
      setNotice({ type: 'success', text: `${selectedTable} 필터 결과 ${Number(sheet?.rows || 0).toLocaleString('ko-KR')}건을 '${sheet?.title || `DB_${selectedTable}`}' 시트에 내보냈습니다.` });
    } catch (error: unknown) {
      sheetWindow?.close();
      setNotice({ type: 'error', text: error instanceof Error ? error.message : '구글시트 내보내기에 실패했습니다.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title="DB 관리" activeTab="database">
      <div className="w-full min-w-0 max-w-[1920px] space-y-3 pb-10" data-sht-app="admin" data-sht-theme="default">
        <section className="border border-[var(--sht-border)] bg-[var(--sht-surface)] p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h1 className="text-base font-semibold text-[var(--sht-heading)]">플랫폼 DB 테이블 관리</h1><p className="mt-0.5 text-xs text-[var(--sht-text-muted)]">테이블을 선택해 값 목록으로 필터링하고, 필요한 컬럼만 표시하거나 Google Sheets로 내보낼 수 있습니다.</p></div><button type="button" onClick={() => void loadTables()} disabled={loadingTables} className="inline-flex h-9 items-center justify-center gap-1.5 border border-[var(--sht-border)] px-3 text-xs font-semibold text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)] disabled:opacity-50"><RefreshCw size={14} className={loadingTables ? 'animate-spin' : ''} />새로고침</button></div>
          {notice && <div role="status" className={`mt-2 border p-2 text-xs ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{notice.text}</div>}
        </section>

        <section className="border border-[var(--sht-border)] bg-[var(--sht-surface)] p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-[var(--sht-heading)]">테이블 선택</h2><p className="mt-0.5 text-xs text-[var(--sht-text-muted)]">공개 테이블 {tables.length}개 · 테이블명 오른쪽 괄호에 한글 설명 표시</p></div><label className="grid w-full gap-1 sm:max-w-xl"><span className="text-xs font-semibold text-[var(--sht-text-muted)]">테이블 목록</span><select value={selectedTable} onChange={(event) => selectTable(event.target.value)} disabled={loadingTables} className="h-9 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] px-2 text-xs text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:opacity-50"><option value="">{loadingTables ? '테이블 목록을 불러오는 중...' : '테이블을 선택하세요'}</option>{tables.map((item) => <option key={item.table} value={item.table}>{item.table} ({describeTable(item.table)})</option>)}</select></label></div></section>

        <section className="w-full min-w-0 max-w-full border border-[var(--sht-border)] bg-[var(--sht-surface)]"><div className="flex flex-col gap-2 border-b border-[var(--sht-border)] p-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-semibold text-[var(--sht-heading)]">{selectedTable || '테이블을 선택하세요'}</h2>{selectedTable && <p className="mt-0.5 text-xs text-[var(--sht-text-muted)]">{describeTable(selectedTable)} · {totalRows.toLocaleString('ko-KR')}건 · 머릿글에서 값 선택 필터·정렬</p>}</div><div className="flex flex-wrap justify-end gap-1.5">{selectedTable && <><button type="button" onClick={() => setColumnPickerOpen((open) => !open)} disabled={columns.length === 0} className="inline-flex h-9 items-center gap-1.5 border border-[var(--sht-border)] px-3 text-xs font-semibold text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)]"><Columns3 size={14} />컬럼 표시</button><button type="button" onClick={openAdd} disabled={loadingRows || saving || columns.length === 0} className="inline-flex h-9 items-center gap-1.5 bg-[var(--sht-primary)] px-3 text-xs font-semibold text-[var(--sht-primary-text)] hover:bg-[var(--sht-primary-hover)] disabled:opacity-50"><Plus size={14} />행 추가</button><button type="button" onClick={() => void exportTable()} disabled={loadingRows || exporting} className="inline-flex h-9 items-center gap-1.5 bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Download size={14} />{exporting ? '내보내는 중...' : '구글시트 내보내기'}<ExternalLink size={13} /></button></>}</div></div>
          {selectedTable && <div className="flex flex-col gap-2 border-b border-[var(--sht-border)] bg-[var(--sht-surface-muted)] p-3 sm:flex-row sm:items-center sm:justify-between"><label className="relative block w-full max-w-xl"><span className="sr-only">행 전체 검색</span><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sht-text-muted)]" /><input value={rowSearch} onChange={(event) => setRowSearch(event.target.value)} placeholder="전체 문자열 검색 (선택 필터와 함께 적용)" className="h-9 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] pl-8 pr-2 text-xs text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]" /></label><button type="button" onClick={() => { setRowSearch(''); setColumnFilters({}); }} className="h-9 border border-[var(--sht-border)] px-3 text-xs text-[var(--sht-text)] hover:bg-[var(--sht-surface)]">필터 초기화</button></div>}
          {columnPickerOpen && <div className="border-b border-[var(--sht-border)] bg-[var(--sht-surface-muted)] p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-[var(--sht-heading)]">표시할 컬럼 선택</p><button type="button" onClick={() => setHiddenColumns([])} className="text-xs font-semibold text-[var(--sht-primary)]">모두 표시</button></div><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">{columns.map((column) => { const visible = !hiddenColumns.includes(column.column_name); return <label key={column.column_name} className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--sht-text)]"><input type="checkbox" checked={visible} onChange={() => toggleColumn(column.column_name)} disabled={visible && visibleColumns.length <= 1} /><span className="truncate">{column.column_name}</span></label>; })}</div></div>}
          <div ref={tableViewportRef} onScroll={syncFromTable} className="w-full max-w-full overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><thead className="bg-[var(--sht-surface-muted)]"><tr>{visibleColumns.map((column) => { const isSorted = sort.column === column.column_name; const SortIcon = !isSorted ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown; const values = filterOptions[column.column_name] || []; const currentFilter = columnFilters[column.column_name] || ''; const shownValues = currentFilter && !values.includes(currentFilter) ? [currentFilter, ...values] : values; return <th key={column.column_name} className="min-w-[170px] border-b border-[var(--sht-border)] px-3 py-2 align-top font-semibold text-[var(--sht-text-muted)]"><button type="button" onClick={() => toggleSort(column.column_name)} className="flex max-w-full items-center gap-1 text-left hover:text-[var(--sht-heading)]" title={`${column.column_name} ${isSorted && sort.direction === 'asc' ? '내림차순' : '오름차순'} 정렬`}><span className="truncate">{column.column_name}</span><SortIcon size={14} aria-hidden="true" /></button><select value={currentFilter} onChange={(event) => updateColumnFilter(column.column_name, event.target.value)} aria-label={`${column.column_name} 값 필터`} className="mt-2 h-8 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] px-1 text-xs font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]"><option value="">모든 값</option>{shownValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></th>; })}</tr></thead><tbody>{loadingRows ? <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="h-48 text-center text-sm text-[var(--sht-text-muted)]">행을 불러오는 중...</td></tr> : rows.length === 0 ? <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="h-48 text-center text-sm text-[var(--sht-text-muted)]">데이터가 없습니다.</td></tr> : rows.map((row, index) => <tr key={`${selectedTable}-${index}`} className="border-b border-[var(--sht-border)] last:border-0 hover:bg-[var(--sht-surface-muted)]">{visibleColumns.map((column) => <td key={column.column_name} className="max-w-[280px] truncate whitespace-nowrap px-3 py-3 text-[var(--sht-text)]" title={formatValue(row[column.column_name])}>{formatValue(row[column.column_name])}</td>)}</tr>)}</tbody></table></div>
          {selectedTable && <div className="flex items-center justify-between border-t border-[var(--sht-border)] px-4 py-3"><button type="button" onClick={() => void loadRows(selectedTable, rowSearch, columnFilters, sort, page - 1)} disabled={page === 0 || loadingRows} className="h-9 border border-[var(--sht-border)] px-3 text-xs text-[var(--sht-text)] disabled:opacity-40">이전</button><span className="text-xs text-[var(--sht-text-muted)]">{page + 1} / {Math.max(1, Math.ceil(totalRows / 100))}</span><button type="button" onClick={() => void loadRows(selectedTable, rowSearch, columnFilters, sort, page + 1)} disabled={!hasMore || loadingRows} className="h-9 border border-[var(--sht-border)] px-3 text-xs text-[var(--sht-text)] disabled:opacity-40">다음</button></div>}
        </section>
      </div>
      {horizontalScroll.visible && <div style={{ left: `${horizontalScroll.left}px`, width: `${horizontalScroll.viewportWidth}px` }} className="fixed bottom-0 z-50 border border-b-0 border-[var(--sht-border)] bg-[var(--sht-surface)]/95 p-2 shadow-lg backdrop-blur"><div ref={bottomScrollbarRef} onScroll={syncFromBottom} className="overflow-x-auto"><div style={{ width: `${horizontalScroll.contentWidth}px`, height: '1px' }} /></div></div>}
      {addOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="db-add-title"><form onSubmit={addRow} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border border-[var(--sht-border)] bg-[var(--sht-surface)] shadow-xl"><header className="flex items-center justify-between border-b border-[var(--sht-border)] px-5 py-4"><h2 id="db-add-title" className="font-semibold text-[var(--sht-heading)]">{selectedTable} 행 추가</h2><button type="button" title="닫기" aria-label="닫기" onClick={() => setAddOpen(false)} className="flex h-11 w-11 items-center justify-center text-[var(--sht-text-muted)] hover:bg-[var(--sht-surface-muted)]"><X size={18} /></button></header><div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">{columns.map((column) => { const generated = Boolean(column.column_default || column.identity_generation); return <label key={column.column_name} className="grid gap-1.5 text-xs font-semibold text-[var(--sht-text-muted)]">{column.column_name}{column.is_nullable === 'NO' && !generated && <span className="text-red-600">필수</span>}<input type={inputType(column)} value={form[column.column_name] ?? ''} disabled={generated} onChange={(event) => setForm((current) => ({ ...current, [column.column_name]: event.target.value }))} placeholder={generated ? '자동 생성' : column.data_type} className="h-11 border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 text-sm font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:bg-[var(--sht-surface-muted)]" /></label>; })}</div><footer className="flex justify-end gap-2 border-t border-[var(--sht-border)] bg-[var(--sht-surface-muted)] px-5 py-4"><button type="button" onClick={() => setAddOpen(false)} className="h-11 border border-[var(--sht-border)] px-4 text-sm font-semibold text-[var(--sht-text)]">취소</button><button type="submit" disabled={saving} className="h-11 bg-[var(--sht-primary)] px-5 text-sm font-semibold text-[var(--sht-primary-text)] disabled:opacity-50">{saving ? '추가 중...' : '행 추가'}</button></footer></form></div>}
    </AdminLayout>
  );
}
