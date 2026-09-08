// 관리자 DB 도구에서 모든 공개 테이블을 조회·필터링·추가·시트 내보내기한다.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, RefreshCw, Search, X } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { getAdminAuthHeaders } from '@/lib/adminAuth';
import type { DbColumn } from '@/lib/dbBrowserTypes';

type TableSummary = { table: string; columnCount: number };
type DbRow = Record<string, unknown>;
type Notice = { type: 'success' | 'error'; text: string } | null;
type SortState = { column: string; direction: 'asc' | 'desc' };

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
  const [tableSearch, setTableSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<DbColumn[]>([]);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [rowSearch, setRowSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
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

  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return query ? tables.filter((item) => item.table.toLowerCase().includes(query)) : tables;
  }, [tableSearch, tables]);

  const selectTable = (table: string) => {
    setSelectedTable(table);
    setRowSearch('');
    setColumnFilters({});
    setSort({ column: '', direction: 'asc' });
    setPage(0);
    setNotice(null);
  };

  const toggleSort = (column: string) => {
    setSort((current) => current.column === column
      ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'asc' });
  };

  const updateColumnFilter = (column: string, value: string) => {
    setColumnFilters((current) => ({ ...current, [column]: value }));
  };

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
    setExporting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/sheets-sync', { method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'table', table: selectedTable, search: rowSearch, filters: columnFilters, sort: sort.column, direction: sort.direction }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '구글시트 내보내기에 실패했습니다.');
      const sheet = result.sheets?.[0];
      setNotice({ type: 'success', text: `${selectedTable} 필터 결과 ${Number(sheet?.rows || 0).toLocaleString('ko-KR')}건을 '${sheet?.title || `DB_${selectedTable}`}' 시트에 내보냈습니다.` });
    } catch (error: unknown) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : '구글시트 내보내기에 실패했습니다.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title="DB 관리" activeTab="database">
      <div className="space-y-4" data-sht-app="admin" data-sht-theme="default">
        <section className="border border-[var(--sht-border)] bg-[var(--sht-surface)] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h1 className="text-lg font-semibold text-[var(--sht-heading)]">플랫폼 DB 테이블 관리</h1><p className="mt-1 text-xs text-[var(--sht-text-muted)]">모든 공개 테이블을 조회하고 검색 결과를 구글시트로 내보내거나 새 행을 추가할 수 있습니다.</p></div><button type="button" onClick={() => void loadTables()} disabled={loadingTables} className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--sht-border)] px-4 text-sm font-semibold text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)] disabled:opacity-50"><RefreshCw size={16} className={loadingTables ? 'animate-spin' : ''} />새로고침</button></div>
          {notice && <div role="status" className={`mt-3 border p-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{notice.text}</div>}
        </section>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border border-[var(--sht-border)] bg-[var(--sht-surface)] p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-[var(--sht-heading)]">테이블 목록</h2><span className="text-xs text-[var(--sht-text-muted)]">{filteredTables.length}/{tables.length}</span></div><label className="relative block"><span className="sr-only">테이블 검색</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sht-text-muted)]" /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="테이블명 검색" className="h-11 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] pl-9 pr-3 text-sm text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]" /></label><div className="mt-3 max-h-[650px] space-y-1 overflow-y-auto pr-1">{loadingTables ? <div className="p-3 text-sm text-[var(--sht-text-muted)]">테이블 목록 로딩 중...</div> : filteredTables.map((item) => <button key={item.table} type="button" onClick={() => selectTable(item.table)} className={`w-full border px-3 py-2 text-left ${selectedTable === item.table ? 'border-[var(--sht-primary)] bg-[var(--sht-surface-muted)]' : 'border-transparent hover:border-[var(--sht-border)] hover:bg-[var(--sht-surface-muted)]'}`}><span className="block break-all text-sm font-medium text-[var(--sht-text)]">{item.table}</span><span className="text-xs text-[var(--sht-text-muted)]">컬럼 {item.columnCount}개</span></button>)}{!loadingTables && filteredTables.length === 0 && <div className="p-3 text-sm text-[var(--sht-text-muted)]">검색 결과가 없습니다.</div>}</div></aside>
          <section className="min-w-0 border border-[var(--sht-border)] bg-[var(--sht-surface)]"><div className="flex flex-col gap-3 border-b border-[var(--sht-border)] p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold text-[var(--sht-heading)]">{selectedTable || '테이블을 선택하세요'}</h2><p className="mt-1 text-xs text-[var(--sht-text-muted)]">{totalRows.toLocaleString('ko-KR')}건 · 1페이지 100건 · 머릿글에서 필터·정렬</p></div><div className="flex flex-wrap justify-end gap-2">{selectedTable && <><button type="button" onClick={openAdd} disabled={loadingRows || saving || columns.length === 0} className="inline-flex h-11 items-center gap-2 bg-[var(--sht-primary)] px-4 text-sm font-semibold text-[var(--sht-primary-text)] hover:bg-[var(--sht-primary-hover)] disabled:opacity-50"><Plus size={16} />행 추가</button><button type="button" onClick={() => void exportTable()} disabled={loadingRows || exporting} className="inline-flex h-11 items-center gap-2 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Download size={16} />{exporting ? '내보내는 중...' : '구글시트 내보내기'}</button></>}</div></div>{selectedTable && <div className="border-b border-[var(--sht-border)] bg-[var(--sht-surface-muted)] p-4"><label className="relative block max-w-xl"><span className="sr-only">행 전체 검색</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sht-text-muted)]" /><input value={rowSearch} onChange={(event) => setRowSearch(event.target.value)} placeholder="전체 문자열 검색 (머릿글 필터와 함께 적용)" className="h-11 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] pl-9 pr-3 text-sm text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]" /></label></div>}<div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><thead className="bg-[var(--sht-surface-muted)]"><tr>{columns.map((column) => { const isSorted = sort.column === column.column_name; const SortIcon = !isSorted ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown; return <th key={column.column_name} className="min-w-[160px] border-b border-[var(--sht-border)] px-3 py-2 align-top font-semibold text-[var(--sht-text-muted)]"><button type="button" onClick={() => toggleSort(column.column_name)} className="flex max-w-full items-center gap-1 text-left hover:text-[var(--sht-heading)]" title={`${column.column_name} ${isSorted && sort.direction === 'asc' ? '내림차순' : '오름차순'} 정렬`}><span className="truncate">{column.column_name}</span><SortIcon size={14} aria-hidden="true" /></button><input value={columnFilters[column.column_name] || ''} onChange={(event) => updateColumnFilter(column.column_name, event.target.value)} placeholder={column.data_type === 'boolean' ? 'true / false' : '필터'} aria-label={`${column.column_name} 필터`} className="mt-2 h-8 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] px-2 text-xs font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]" /></th>; })}</tr></thead><tbody>{loadingRows ? <tr><td colSpan={Math.max(columns.length, 1)} className="h-48 text-center text-sm text-[var(--sht-text-muted)]">행을 불러오는 중...</td></tr> : rows.length === 0 ? <tr><td colSpan={Math.max(columns.length, 1)} className="h-48 text-center text-sm text-[var(--sht-text-muted)]">데이터가 없습니다.</td></tr> : rows.map((row, index) => <tr key={`${selectedTable}-${index}`} className="border-b border-[var(--sht-border)] last:border-0 hover:bg-[var(--sht-surface-muted)]">{columns.map((column) => <td key={column.column_name} className="max-w-[280px] truncate whitespace-nowrap px-3 py-3 text-[var(--sht-text)]" title={formatValue(row[column.column_name])}>{formatValue(row[column.column_name])}</td>)}</tr>)}</tbody></table></div>{selectedTable && <div className="flex items-center justify-between border-t border-[var(--sht-border)] px-4 py-3"><button type="button" onClick={() => void loadRows(selectedTable, rowSearch, columnFilters, sort, page - 1)} disabled={page === 0 || loadingRows} className="h-10 border border-[var(--sht-border)] px-3 text-sm text-[var(--sht-text)] disabled:opacity-40">이전</button><span className="text-xs text-[var(--sht-text-muted)]">{page + 1} / {Math.max(1, Math.ceil(totalRows / 100))}</span><button type="button" onClick={() => void loadRows(selectedTable, rowSearch, columnFilters, sort, page + 1)} disabled={!hasMore || loadingRows} className="h-10 border border-[var(--sht-border)] px-3 text-sm text-[var(--sht-text)] disabled:opacity-40">다음</button></div>}</section>
        </div>
      </div>
      {addOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="db-add-title"><form onSubmit={addRow} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border border-[var(--sht-border)] bg-[var(--sht-surface)] shadow-xl"><header className="flex items-center justify-between border-b border-[var(--sht-border)] px-5 py-4"><h2 id="db-add-title" className="font-semibold text-[var(--sht-heading)]">{selectedTable} 행 추가</h2><button type="button" title="닫기" aria-label="닫기" onClick={() => setAddOpen(false)} className="flex h-11 w-11 items-center justify-center text-[var(--sht-text-muted)] hover:bg-[var(--sht-surface-muted)]"><X size={18} /></button></header><div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">{columns.map((column) => { const generated = Boolean(column.column_default || column.identity_generation); return <label key={column.column_name} className="grid gap-1.5 text-xs font-semibold text-[var(--sht-text-muted)]">{column.column_name}{column.is_nullable === 'NO' && !generated && <span className="text-red-600">필수</span>}<input type={inputType(column)} value={form[column.column_name] ?? ''} disabled={generated} onChange={(event) => setForm((current) => ({ ...current, [column.column_name]: event.target.value }))} placeholder={generated ? '자동 생성' : column.data_type} className="h-11 border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 text-sm font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:bg-[var(--sht-surface-muted)]" /></label>; })}</div><footer className="flex justify-end gap-2 border-t border-[var(--sht-border)] bg-[var(--sht-surface-muted)] px-5 py-4"><button type="button" onClick={() => setAddOpen(false)} className="h-11 border border-[var(--sht-border)] px-4 text-sm font-semibold text-[var(--sht-text)]">취소</button><button type="submit" disabled={saving} className="h-11 bg-[var(--sht-primary)] px-5 text-sm font-semibold text-[var(--sht-primary-text)] disabled:opacity-50">{saving ? '추가 중...' : '행 추가'}</button></footer></form></div>}
    </AdminLayout>
  );
}
