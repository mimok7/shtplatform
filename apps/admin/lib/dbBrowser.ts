// 플랫폼 DB의 공개 테이블 메타데이터와 행 조회를 관리자 도구에서 공통으로 사용한다.
import serviceSupabase from '@/lib/serviceSupabase';
import { fetchAll } from '@/lib/exportAuth';

const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type DbColumn = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  identity_generation: string | null;
  ordinal_position: number;
};

function assertTableName(table: string) {
  if (!TABLE_NAME_PATTERN.test(table)) throw new Error('테이블 이름 형식이 올바르지 않습니다.');
}

function escapeSearch(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll(',', '\\,');
}

export async function getPublicTableColumns(table?: string): Promise<DbColumn[]> {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  if (table) assertTableName(table);

  let query = serviceSupabase
    .from('information_schema.columns')
    .select('column_name,data_type,is_nullable,column_default,identity_generation,ordinal_position')
    .eq('table_schema', 'public')
    .order('ordinal_position', { ascending: true });
  if (table) query = query.eq('table_name', table);

  const { data, error } = await query;
  if (error) throw new Error(error.message || '테이블 컬럼 조회에 실패했습니다.');
  return (data || []) as DbColumn[];
}

export async function listPublicTables() {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  const [tableResult, columnResult] = await Promise.all([
    serviceSupabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public').eq('table_type', 'BASE TABLE').order('table_name', { ascending: true }),
    serviceSupabase.from('information_schema.columns').select('table_name,column_name,ordinal_position').eq('table_schema', 'public'),
  ]);
  if (tableResult.error) throw new Error(tableResult.error.message || '테이블 목록 조회에 실패했습니다.');
  if (columnResult.error) throw new Error(columnResult.error.message || '테이블 컬럼 조회에 실패했습니다.');
  const tableNames = new Set((tableResult.data || []).map((row) => String(row.table_name || '')));
  const counts = new Map<string, number>();
  for (const row of columnResult.data || []) {
    const table = String(row.table_name || '');
    if (table && tableNames.has(table)) counts.set(table, (counts.get(table) || 0) + 1);
  }
  return [...tableNames].map((table) => ({ table, columnCount: counts.get(table) || 0 }));
}

export async function fetchTablePage(table: string, options: { search?: string; offset?: number; limit?: number } = {}) {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  assertTableName(table);
  const columns = await getPublicTableColumns(table);
  if (columns.length === 0) throw new Error('존재하지 않는 공개 테이블입니다.');

  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
  const search = String(options.search || '').trim();
  let query: any = serviceSupabase
    .from(table)
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order(columns[0].column_name, { ascending: false });

  if (search) {
    const textColumns = columns
      .filter((column) => ['character varying', 'text', 'character', 'uuid', 'date', 'timestamp without time zone', 'timestamp with time zone'].includes(column.data_type))
      .map((column) => `${column.column_name}.ilike.%${escapeSearch(search)}%`);
    if (textColumns.length === 0) return { columns, rows: [], count: 0, hasMore: false, offset, limit };
    query = query.or(textColumns.join(','));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || '테이블 행 조회에 실패했습니다.');
  return { columns, rows: data || [], count: count || 0, hasMore: (count || 0) > offset + limit, offset, limit };
}

export async function insertTableRow(table: string, values: Record<string, unknown>) {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  assertTableName(table);
  const columns = await getPublicTableColumns(table);
  if (columns.length === 0) throw new Error('존재하지 않는 공개 테이블입니다.');
  const allowed = new Set(columns.map((column) => column.column_name));
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (!allowed.has(key)) throw new Error(`허용되지 않은 컬럼입니다: ${key}`);
    if (value !== '' && value !== null && value !== undefined) payload[key] = value;
  }
  if (Object.keys(payload).length === 0) throw new Error('추가할 값을 하나 이상 입력해 주세요.');
  const { data, error } = await serviceSupabase.from(table).insert(payload).select('*').single();
  if (error) throw new Error(error.message || '행 추가에 실패했습니다.');
  return data;
}

export async function fetchTableRowsForExport(table: string, search = '') {
  const first = await fetchTablePage(table, { search, offset: 0, limit: 500 });
  if (!search) {
    if (first.hasMore) {
      const all = await fetchAll(table, (query) => query.order(first.columns[0].column_name, { ascending: false }));
      return { columns: first.columns, rows: all };
    }
    return { columns: first.columns, rows: first.rows };
  }

  const rows = [...first.rows];
  let offset = first.limit;
  while (first.hasMore && rows.length < first.count) {
    const next = await fetchTablePage(table, { search, offset, limit: 500 });
    rows.push(...next.rows);
    if (!next.hasMore) break;
    offset += next.limit;
  }
  return { columns: first.columns, rows };
}
