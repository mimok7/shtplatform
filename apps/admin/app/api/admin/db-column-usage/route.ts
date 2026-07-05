// DB 메타데이터를 직접 조회해 테이블/컬럼 사용처를 분석해 반환하는 관리자 API.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkAdmin } from '@/lib/exportAuth';
import serviceSupabase from '@/lib/serviceSupabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

type DbColumnRow = {
  table: string;
  column: string;
  dataType: string;
  nullable: string;
  position: number;
};

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

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vercel',
]);

const INCLUDE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.sql',
  '.md',
  '.json',
  '.mjs',
  '.cjs',
]);

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/');
}

async function resolveRepoRoot(): Promise<string> {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
    path.resolve(process.cwd(), '../../..'),
  ];

  for (const candidate of candidates) {
    try {
      const appsDir = path.join(candidate, 'apps');
      await fs.access(appsDir);
      return candidate;
    } catch {
      // noop
    }
  }

  return process.cwd();
}

async function readDbRows(): Promise<{ rows: DbColumnRow[]; repoRoot: string }> {
  if (!serviceSupabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  }

  const { data, error } = await serviceSupabase
    .from('information_schema.columns')
    .select('table_name,column_name,data_type,is_nullable,ordinal_position')
    .eq('table_schema', 'public')
    .order('table_name', { ascending: true })
    .order('ordinal_position', { ascending: true });

  if (error) {
    throw new Error(error.message || 'DB 메타데이터 조회에 실패했습니다.');
  }

  const rows: DbColumnRow[] = (data || [])
    .map((r: any) => ({
      table: String(r.table_name || '').trim(),
      column: String(r.column_name || '').trim(),
      dataType: String(r.data_type || '').trim(),
      nullable: String(r.is_nullable || '').trim(),
      position: Number(r.ordinal_position || 0),
    }))
    .filter((r) => r.table && r.column);

  const repoRoot = await resolveRepoRoot();
  return { rows, repoRoot };
}

async function listSourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await listSourceFiles(fullPath, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDE_EXTENSIONS.has(ext)) continue;

    out.push(fullPath);
  }

  return out;
}

function countHits(text: string, token: string): number {
  if (!token) return 0;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}(?=[^a-zA-Z0-9_]|$)`, 'g');
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function toRelative(repoRoot: string, absolute: string): string {
  return normalizePath(path.relative(repoRoot, absolute));
}

async function buildUsageForTable(repoRoot: string, table: string, rows: DbColumnRow[]) {
  const columns = rows
    .filter((r) => r.table === table)
    .sort((a, b) => a.position - b.position);

  const files = await listSourceFiles(repoRoot);
  const usageMap = new Map<string, { hitCount: number; files: string[] }>();
  const tableFiles: string[] = [];

  for (const col of columns) {
    usageMap.set(col.column, { hitCount: 0, files: [] });
  }

  for (const filePath of files) {
    let content = '';
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 1024 * 1024) continue;
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const rel = toRelative(repoRoot, filePath);

    if (content.includes(table)) {
      tableFiles.push(rel);
    }

    for (const col of columns) {
      const hits = countHits(content, col.column);
      if (hits <= 0) continue;

      const usage = usageMap.get(col.column);
      if (!usage) continue;

      usage.hitCount += hits;
      if (usage.files.length < 30) {
        usage.files.push(rel);
      }
    }
  }

  const columnsUsage: ColumnUsage[] = columns.map((col) => {
    const usage = usageMap.get(col.column) || { hitCount: 0, files: [] };
    return {
      column: col.column,
      dataType: col.dataType,
      nullable: col.nullable,
      position: col.position,
      hitCount: usage.hitCount,
      files: usage.files,
    };
  });

  return {
    table,
    columnCount: columns.length,
    tableUsageFileCount: tableFiles.length,
    tableUsageFiles: tableFiles.slice(0, 50),
    columns: columnsUsage,
    scannedFileCount: files.length,
  };
}

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows, repoRoot } = await readDbRows();
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'tables').trim();

    if (mode === 'tables') {
      const tableMap = new Map<string, number>();
      for (const row of rows) {
        tableMap.set(row.table, (tableMap.get(row.table) || 0) + 1);
      }

      const tables: TableSummary[] = Array.from(tableMap.entries())
        .map(([table, columnCount]) => ({ table, columnCount }))
        .sort((a, b) => a.table.localeCompare(b.table));

      return NextResponse.json({
        ok: true,
        totalTables: tables.length,
        totalColumns: rows.length,
        tables,
      });
    }

    if (mode === 'usage') {
      const table = (searchParams.get('table') || '').trim();
      if (!table) {
        return NextResponse.json({ error: 'table 파라미터가 필요합니다.' }, { status: 400 });
      }

      const exists = rows.some((r) => r.table === table);
      if (!exists) {
        return NextResponse.json({ error: `DB 메타데이터에 없는 테이블입니다: ${table}` }, { status: 404 });
      }

      const payload = await buildUsageForTable(repoRoot, table, rows);
      return NextResponse.json({ ok: true, ...payload });
    }

    return NextResponse.json({ error: 'mode는 tables 또는 usage만 지원합니다.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
