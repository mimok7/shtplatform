'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';
import { ProductDataset, ProductField, SERVICE_PRODUCT_CATALOG } from '@/lib/serviceProductCatalog';

type RowValue = string | number | boolean | null | undefined;
type Row = Record<string, RowValue>;
type DatasetRows = Record<string, Row[]>;
type ApiResult = { datasets?: DatasetRows; error?: string; syncWarning?: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function emptyForm(dataset: ProductDataset) {
  const defaults = { ...(dataset.insertDefaults || {}) } as Row;
  for (const field of dataset.fields) {
    if (defaults[field.key] !== undefined) continue;
    defaults[field.key] = field.type === 'boolean' ? false : '';
  }
  return defaults;
}

function displayValue(value: unknown) {
  if (value === true) return '사용';
  if (value === false) return '미사용';
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('ko-KR');
  return String(value);
}

export default function ServiceProductsPage() {
  const [serviceId, setServiceId] = useState(SERVICE_PRODUCT_CATALOG[0].id);
  const [datasetId, setDatasetId] = useState(SERVICE_PRODUCT_CATALOG[0].datasets[0].id);
  const [datasets, setDatasets] = useState<DatasetRows>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const service = useMemo(() => SERVICE_PRODUCT_CATALOG.find((item) => item.id === serviceId) || SERVICE_PRODUCT_CATALOG[0], [serviceId]);
  const dataset = useMemo(() => service.datasets.find((item) => item.id === datasetId) || service.datasets[0], [service, datasetId]);

  const request = useCallback(async (method: string, body?: Record<string, unknown>, selectedService = serviceId) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(`/api/admin/service-products${method === 'GET' ? `?service=${encodeURIComponent(selectedService)}` : ''}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({})) as ApiResult;
    if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
    return result;
  }, [serviceId]);

  const load = useCallback(async (selectedService = serviceId) => {
    setLoading(true);
    setNotice(null);
    try {
      const result = await request('GET', undefined, selectedService);
      setDatasets(result.datasets || {});
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, '상품 데이터를 불러오지 못했습니다.') });
    } finally {
      setLoading(false);
    }
  }, [request, serviceId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => datasets[dataset.id] || [], [dataset.id, datasets]);
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => dataset.columns.some((column) => String(row[column] ?? '').toLowerCase().includes(keyword)));
  }, [dataset.columns, rows, search]);

  function selectService(nextServiceId: string) {
    const nextService = SERVICE_PRODUCT_CATALOG.find((item) => item.id === nextServiceId) || SERVICE_PRODUCT_CATALOG[0];
    setServiceId(nextService.id);
    setDatasetId(nextService.datasets[0].id);
    setDatasets({});
    setSearch('');
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(dataset));
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    setForm(Object.fromEntries(dataset.fields.map((field) => [field.key, row[field.key] ?? (field.type === 'boolean' ? false : '')])));
    setModalOpen(true);
  }

  function relationOptions(field: ProductField) {
    if (!field.relation) return field.options || [];
    const relatedRows = datasets[field.relation.dataset] || [];
    const unique = new Map<string, string>();
    for (const row of relatedRows) {
      const value = row[field.relation.valueField];
      if (value === null || value === undefined || value === '') continue;
      unique.set(String(value), String(row[field.relation.labelField] || value));
    }
    return [...unique.entries()].sort((left, right) => left[1].localeCompare(right[1], 'ko')).map(([value, label]) => ({ value, label }));
  }

  function updateField(field: ProductField, value: RowValue) {
    setForm((current) => {
      const next = { ...current, [field.key]: value };
      if (service.id === 'hotel' && dataset.id === 'rooms' && field.key === 'hotel_code') {
        const hotel = (datasets.hotels || []).find((row) => row.hotel_code === value);
        if (hotel) next.hotel_name = hotel.hotel_name;
      }
      return next;
    });
  }

  async function saveRow(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const payload = { service: service.id, dataset: dataset.id, values: form };
      const result = editing
        ? await request('PATCH', { ...payload, id: editing[dataset.primaryKey] })
        : await request('POST', payload);
      setModalOpen(false);
      await load(service.id);
      setNotice(result.syncWarning
        ? { type: 'warning', text: `플랫폼 저장 완료. 홈페이지 동기화 확인 필요: ${result.syncWarning}` }
        : { type: 'success', text: '플랫폼 저장과 홈페이지 동기화를 완료했습니다.' });
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, '저장하지 못했습니다.') });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row: Row) {
    const name = dataset.columns.map((column) => row[column]).find((value) => typeof value === 'string' && value) || row[dataset.primaryKey];
    if (!window.confirm(`"${name}" 항목을 삭제하시겠습니까? 연결된 예약 데이터가 있으면 삭제가 거부됩니다.`)) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await request('DELETE', { service: service.id, dataset: dataset.id, id: row[dataset.primaryKey] });
      await load(service.id);
      setNotice(result.syncWarning
        ? { type: 'warning', text: `플랫폼 삭제 완료. 홈페이지 동기화 확인 필요: ${result.syncWarning}` }
        : { type: 'success', text: '플랫폼 삭제와 홈페이지 동기화를 완료했습니다.' });
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, '삭제하지 못했습니다.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="서비스 상품 관리" activeTab="service-products">
      <div className="w-full space-y-4" data-sht-app="admin" data-sht-theme="default">
        <section className="border border-[var(--sht-border)] bg-[var(--sht-surface)]">
          <div className="flex flex-col gap-4 border-b border-[var(--sht-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-[var(--sht-heading)]">서비스 상품 관리</h1>
              <p className="mt-1 text-xs text-[var(--sht-text-muted)]">원본: 플랫폼 DB · 저장 후 홈페이지 자동 동기화</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" title="새로고침" aria-label="새로고침" onClick={() => void load(service.id)} disabled={loading || saving} className="flex h-11 w-11 items-center justify-center border border-[var(--sht-border)] bg-[var(--sht-surface)] text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)] disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
              <button type="button" onClick={openCreate} disabled={loading || saving} className="flex h-11 items-center gap-2 bg-[var(--sht-primary)] px-4 font-semibold text-[var(--sht-primary-text)] hover:bg-[var(--sht-primary-hover)] disabled:opacity-50"><Plus size={17} />추가</button>
            </div>
          </div>

          <div className="flex flex-wrap border-b border-[var(--sht-border)] bg-[var(--sht-surface-muted)] p-2" role="tablist" aria-label="서비스 선택">
            {SERVICE_PRODUCT_CATALOG.map((item) => <button key={item.id} type="button" role="tab" aria-selected={service.id === item.id} onClick={() => selectService(item.id)} className={`h-11 px-4 font-semibold ${service.id === item.id ? 'bg-[var(--sht-primary)] text-[var(--sht-primary-text)]' : 'text-[var(--sht-text)] hover:bg-[var(--sht-surface)]'}`}>{item.label}</button>)}
          </div>

          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label={`${service.label} 데이터 선택`}>
              {service.datasets.map((item) => <button key={item.id} type="button" role="tab" aria-selected={dataset.id === item.id} onClick={() => { setDatasetId(item.id); setSearch(''); }} className={`h-11 border px-4 font-medium ${dataset.id === item.id ? 'border-[var(--sht-primary)] bg-[var(--sht-primary)] text-[var(--sht-primary-text)]' : 'border-[var(--sht-border)] bg-[var(--sht-surface)] text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)]'}`}>{item.label}</button>)}
            </div>
            <label className="relative block min-w-0 md:w-80">
              <span className="sr-only">상품 검색</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sht-text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 코드, 노선 검색" className="h-11 w-full border border-[var(--sht-border)] bg-[var(--sht-surface)] pl-9 pr-3 text-sm text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)]" />
            </label>
          </div>
        </section>

        {notice && <div role="status" className={`flex items-start gap-2 border p-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : notice.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-700'}`}>{notice.type === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}<span>{notice.text}</span></div>}

        <section className="overflow-hidden border border-[var(--sht-border)] bg-[var(--sht-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--sht-border)] px-4 py-3"><h2 className="font-semibold text-[var(--sht-heading)]">{service.label} · {dataset.label}</h2><span className="text-xs text-[var(--sht-text-muted)]">{filteredRows.length.toLocaleString('ko-KR')}건</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-[var(--sht-surface-muted)] text-xs text-[var(--sht-text-muted)]"><tr>{dataset.columns.map((column) => <th key={column} className="border-b border-[var(--sht-border)] px-3 py-3 font-semibold">{dataset.fields.find((field) => field.key === column)?.label || column}</th>)}<th className="w-24 border-b border-[var(--sht-border)] px-3 py-3 text-right font-semibold">작업</th></tr></thead>
              <tbody>{loading ? <tr><td colSpan={dataset.columns.length + 1} className="h-40 text-center text-[var(--sht-text-muted)]">불러오는 중...</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={dataset.columns.length + 1} className="h-40 text-center text-[var(--sht-text-muted)]">데이터가 없습니다.</td></tr> : filteredRows.map((row) => <tr key={String(row[dataset.primaryKey])} className="border-b border-[var(--sht-border)] last:border-0 hover:bg-[var(--sht-surface-muted)]">{dataset.columns.map((column) => <td key={column} className="truncate px-3 py-3 text-[var(--sht-text)]" title={displayValue(row[column])}>{displayValue(row[column])}</td>)}<td className="px-3 py-2"><div className="flex justify-end gap-1"><button type="button" title="수정" aria-label="수정" onClick={() => openEdit(row)} className="flex h-10 w-10 items-center justify-center text-[var(--sht-link)] hover:bg-[var(--sht-surface-muted)]"><Edit3 size={16} /></button><button type="button" title="삭제" aria-label="삭제" onClick={() => void deleteRow(row)} className="flex h-10 w-10 items-center justify-center text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="service-product-dialog-title">
        <form onSubmit={saveRow} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border border-[var(--sht-border)] bg-[var(--sht-surface)] shadow-xl">
          <header className="flex items-center justify-between border-b border-[var(--sht-border)] px-5 py-4"><h2 id="service-product-dialog-title" className="text-base font-semibold text-[var(--sht-heading)]">{editing ? `${dataset.label} 수정` : `${dataset.label} 추가`}</h2><button type="button" title="닫기" aria-label="닫기" onClick={() => setModalOpen(false)} className="flex h-11 w-11 items-center justify-center text-[var(--sht-text-muted)] hover:bg-[var(--sht-surface-muted)]"><X size={19} /></button></header>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
            {dataset.fields.map((field) => {
              const options = relationOptions(field);
              const primaryKeyLocked = Boolean(editing && field.key === dataset.primaryKey);
              if (field.type === 'boolean') return <label key={field.key} className="flex min-h-11 items-center gap-3 border border-[var(--sht-border)] bg-[var(--sht-surface-muted)] px-3 text-sm font-medium text-[var(--sht-text)]"><input type="checkbox" checked={Boolean(form[field.key])} onChange={(event) => updateField(field, event.target.checked)} className="h-5 w-5 accent-[var(--sht-primary)]" />{field.label}</label>;
              const wide = field.type === 'textarea' || /description|notes|policy|amenities|warnings/.test(field.key);
              return <label key={field.key} className={`grid gap-1.5 text-xs font-semibold text-[var(--sht-text-muted)] ${wide ? 'md:col-span-2' : ''}`}>{field.label}{field.required && <span className="sr-only">필수</span>}
                {field.type === 'textarea' ? <textarea rows={4} value={String(form[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} required={field.required} disabled={primaryKeyLocked} className="w-full resize-y border border-[var(--sht-border)] bg-[var(--sht-surface)] p-3 text-sm font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:bg-[var(--sht-surface-muted)]" /> : options.length > 0 ? <select value={String(form[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} required={field.required} disabled={primaryKeyLocked} className="h-11 border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 text-sm font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:bg-[var(--sht-surface-muted)]"><option value="">선택</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} value={String(form[field.key] ?? '')} onChange={(event) => updateField(field, event.target.value)} required={field.required} disabled={primaryKeyLocked} className="h-11 border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 text-sm font-normal text-[var(--sht-text)] focus:outline-none focus:ring-2 focus:ring-[var(--sht-focus)] disabled:bg-[var(--sht-surface-muted)]" />}
              </label>;
            })}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[var(--sht-border)] bg-[var(--sht-surface-muted)] px-5 py-4"><button type="button" onClick={() => setModalOpen(false)} className="h-11 border border-[var(--sht-border)] bg-[var(--sht-surface)] px-4 font-semibold text-[var(--sht-text)] hover:bg-[var(--sht-surface-muted)]">취소</button><button type="submit" disabled={saving} className="h-11 bg-[var(--sht-primary)] px-5 font-semibold text-[var(--sht-primary-text)] hover:bg-[var(--sht-primary-hover)] disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button></footer>
        </form>
      </div>}
    </AdminLayout>
  );
}
