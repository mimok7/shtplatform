// db.csv를 읽어 테이블/컬럼 사용처를 분석해 반환하는 관리자 API.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkAdmin } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 120;

type DbCsvRow = {
  table: string;
  column: string;
  dataType: string;
  nullable: string;
  defaultValue: string;
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

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/');
}

async function resolveDbCsvPath(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), '../../sql/db.csv'),
    path.resolve(process.cwd(), '../sql/db.csv'),
    path.resolve(process.cwd(), 'sql/db.csv'),
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // noop
    }
  }

  throw new Error('sql/db.csv 파일을 찾을 수 없습니다.');
}

async function readDbCsvRows(): Promise<{ rows: DbCsvRow[]; repoRoot: string }> {
  const dbCsvPath = await resolveDbCsvPath();
  const repoRoot = path.dirname(path.dirname(dbCsvPath));
  const raw = await fs.readFile(dbCsvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], repoRoot };
  }

  const rows: DbCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 6) continue;

    const table = (cols[0] || '').trim();
    const column = (cols[1] || '').trim();
    const dataType = (cols[2] || '').trim();
    const nullable = (cols[3] || '').trim();
    const defaultValue = (cols[4] || '').trim();
    const position = Number((cols[5] || '').trim()) || 0;

    if (!table || !column) continue;

    rows.push({ table, column, dataType, nullable, defaultValue, position });
  }

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

async function buildUsageForTable(repoRoot: string, table: string, rows: DbCsvRow[]) {
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
    const { rows, repoRoot } = await readDbCsvRows();
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
        return NextResponse.json({ error: `db.csv에 없는 테이블입니다: ${table}` }, { status: 404 });
      }

      const payload = await buildUsageForTable(repoRoot, table, rows);
      return NextResponse.json({ ok: true, ...payload });
    }

    return NextResponse.json({ error: 'mode는 tables 또는 usage만 지원합니다.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
