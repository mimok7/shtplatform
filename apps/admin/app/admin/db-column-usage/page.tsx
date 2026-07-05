'use client';
// DB 메타데이터 기반 테이블/컬럼 사용처를 조회하는 관리자 페이지.
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { getSupabase } from '@/lib/supabase';

type TableSummary = {
  table: string;
  columnCount: number;
};

type ColumnUsage = {
  column: string;
  dataType: string;
  nullable: string;
  position: number;
  hitCount: number;
  files: string[];
};

type UsageResponse = {
  ok: true;
  table: string;
  columnCount: number;
  tableUsageFileCount: number;
  tableUsageFiles: string[];
  columns: ColumnUsage[];
  scannedFileCount: number;
};

export default function DbColumnUsagePage() {
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [error, setError] = useState<string>('');

  const [tables, setTables] = useState<TableSummary[]>([]);
  const [totalTables, setTotalTables] = useState(0);
  const [totalColumns, setTotalColumns] = useState(0);

  const [tableQuery, setTableQuery] = useState('');
  const [columnQuery, setColumnQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await getSupabase().auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadTables = async () => {
    setLoadingTables(true);
    setError('');

    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/db-column-usage?mode=tables', { headers, cache: 'no-store' });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || '테이블 목록 조회 실패');
      }

      setTables(json.tables || []);
      setTotalTables(json.totalTables || 0);
      setTotalColumns(json.totalColumns || 0);

      if (!selectedTable && json.tables?.length > 0) {
        setSelectedTable(json.tables[0].table);
      }
    } catch (e: any) {
      setError(e?.message || '테이블 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLoadingTables(false);
    }
  };

  const loadUsage = async (table: string) => {
    if (!table) return;
    setLoadingUsage(true);
    setError('');

    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/db-column-usage?mode=usage&table=${encodeURIComponent(table)}`, {
        headers,
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || '사용처 분석 실패');
      }

      setUsage(json as UsageResponse);
    } catch (e: any) {
      setError(e?.message || '사용처 분석 중 오류가 발생했습니다.');
      setUsage(null);
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    loadUsage(selectedTable);
  }, [selectedTable]);

  const filteredTables = useMemo(() => {
    if (!tableQuery.trim()) return tables;
    const q = tableQuery.toLowerCase();
    return tables.filter((t) => t.table.toLowerCase().includes(q));
  }, [tables, tableQuery]);

  const filteredColumns = useMemo(() => {
    const cols = usage?.columns || [];
    if (!columnQuery.trim()) return cols;
    const q = columnQuery.toLowerCase();
    return cols.filter((c) => c.column.toLowerCase().includes(q));
  }, [usage, columnQuery]);

  return (
    <AdminLayout title="DB 컬럼 사용처" activeTab="db-column-usage">
      <div className="space-y-4">
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-900">DB 기반 컬럼 사용처 점검</h2>
          <p className="text-sm text-gray-600 mt-1">
            DB 메타데이터에서 테이블/컬럼을 직접 읽고, 저장소 파일에서 문자열 사용처를 분석합니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">테이블 {totalTables}개</span>
            <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-100">컬럼 {totalColumns}개</span>
            <button
              onClick={() => {
                loadTables();
                if (selectedTable) loadUsage(selectedTable);
              }}
              className="px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-black"
            >
              새로고침
            </button>
          </div>
          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">테이블 목록</h3>
              <span className="text-xs text-gray-500">{filteredTables.length}개</span>
            </div>
            <input
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="테이블명 검색"
              className="w-full border rounded-md px-3 py-2 text-sm mb-3"
            />

            <div className="max-h-[560px] overflow-auto border rounded-md divide-y">
              {loadingTables ? (
                <div className="p-4 text-sm text-gray-500">테이블 목록 로딩 중...</div>
              ) : filteredTables.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">검색 결과가 없습니다.</div>
              ) : (
                filteredTables.map((t) => (
                  <button
                    key={t.table}
                    onClick={() => setSelectedTable(t.table)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedTable === t.table ? 'bg-blue-50' : ''}`}
                  >
                    <div className="font-medium text-gray-900 break-all">{t.table}</div>
                    <div className="text-xs text-gray-500">컬럼 {t.columnCount}개</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="xl:col-span-8 bg-white border rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">컬럼 사용처</h3>
              {usage && (
                <div className="text-xs text-gray-500">
                  스캔 파일 {usage.scannedFileCount}개, 테이블 직접 언급 파일 {usage.tableUsageFileCount}개
                </div>
              )}
            </div>

            {selectedTable && (
              <div className="text-sm text-gray-700 mb-3 break-all">
                선택 테이블 <span className="font-semibold">{selectedTable}</span>
              </div>
            )}

            <input
              value={columnQuery}
              onChange={(e) => setColumnQuery(e.target.value)}
              placeholder="컬럼명 검색"
              className="w-full border rounded-md px-3 py-2 text-sm mb-3"
            />

            {loadingUsage ? (
              <div className="text-sm text-gray-500">사용처 분석 중...</div>
            ) : !usage ? (
              <div className="text-sm text-gray-500">테이블을 선택하면 컬럼 사용처가 표시됩니다.</div>
            ) : (
              <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
                {filteredColumns.map((col) => (
                  <div key={col.column} className="border rounded-md p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{col.column}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{col.dataType || '-'}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">NULL {col.nullable}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">hits {col.hitCount}</span>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      사용 파일 {col.files.length}개
                    </div>

                    {col.files.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {col.files.slice(0, 12).map((f) => (
                          <span key={f} className="text-xs px-2 py-1 rounded border bg-gray-50 text-gray-700">
                            {f}
                          </span>
                        ))}
                        {col.files.length > 12 && (
                          <span className="text-xs px-2 py-1 rounded border bg-white text-gray-500">
                            +{col.files.length - 12}개 더
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-gray-400">검색된 사용처 없음</div>
                    )}
                  </div>
                ))}
                {filteredColumns.length === 0 && (
                  <div className="text-sm text-gray-500">조건에 맞는 컬럼이 없습니다.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
