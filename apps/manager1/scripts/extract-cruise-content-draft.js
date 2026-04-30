#!/usr/bin/env node
/*
  Draft extractor for cruise intro/room intro/room images.
  Flow: Upload -> Auto extract -> Admin review -> Confirm save -> Customer exposure

  Usage:
    node scripts/extract-cruise-content-draft.js --input ./tmp/source.txt --images ./tmp/images --out ./tmp/extracted.json

  Optional env for matching candidates from current DB (Supabase REST):
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
*/

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { input: '', images: '', out: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--input') args.input = val || '';
    if (key === '--images') args.images = val || '';
    if (key === '--out') args.out = val || '';
  }
  return args;
}

function readInputText(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const raw = fs.readFileSync(inputPath, 'utf8');

  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed?.pages)) {
      return parsed.pages
        .map((p) => (typeof p === 'string' ? p : p?.text || ''))
        .filter(Boolean)
        .join('\n\n');
    }
    if (typeof parsed?.text === 'string') return parsed.text;
    return JSON.stringify(parsed);
  }

  return raw;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\[\]\(\){}<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const sa = new Set(na.split(' ').filter(Boolean));
  const sb = new Set(nb.split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;

  let inter = 0;
  for (const token of sa) {
    if (sb.has(token)) inter += 1;
  }
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

function topCandidates(target, pool, limit = 5) {
  return pool
    .map((name) => ({ name, score: Number(similarity(target, name).toFixed(3)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function fetchCatalogFromSupabase() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return { cruiseNames: [], roomNames: [], source: 'env-missing' };
  }

  const url = `${baseUrl}/rest/v1/cruise_info?select=cruise_name,room_name&limit=5000`;
  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    return { cruiseNames: [], roomNames: [], source: `http-${response.status}` };
  }

  const rows = await response.json();
  const cruiseNames = Array.from(
    new Set(
      (rows || [])
        .map((r) => String(r?.cruise_name || '').trim())
        .filter(Boolean)
    )
  );
  const roomNames = Array.from(
    new Set(
      (rows || [])
        .map((r) => String(r?.room_name || '').trim())
        .filter(Boolean)
    )
  );

  return { cruiseNames, roomNames, source: 'supabase-rest' };
}

function extractCruiseDrafts(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const drafts = [];
  let current = null;
  let mode = 'none';

  const cruiseHead = /^(크루즈|cruise)\s*[:\-]\s*(.+)$/i;
  const roomHead = /^(객실|room)\s*[:\-]\s*(.+)$/i;
  const introHead = /^(소개|intro|description)\s*[:\-]\s*(.+)$/i;

  for (const line of lines) {
    const c = line.match(cruiseHead);
    if (c) {
      if (current) drafts.push(current);
      current = {
        cruise_name_raw: c[2].trim(),
        cruise_intro_raw: '',
        rooms: [],
      };
      mode = 'cruise_intro';
      continue;
    }

    if (!current) continue;

    const r = line.match(roomHead);
    if (r) {
      current.rooms.push({
        room_name_raw: r[2].trim(),
        room_intro_raw: '',
        room_images: [],
      });
      mode = 'room_intro';
      continue;
    }

    const i = line.match(introHead);
    if (i) {
      if (mode === 'room_intro' && current.rooms.length > 0) {
        const idx = current.rooms.length - 1;
        current.rooms[idx].room_intro_raw += `${current.rooms[idx].room_intro_raw ? '\n' : ''}${i[2].trim()}`;
      } else {
        current.cruise_intro_raw += `${current.cruise_intro_raw ? '\n' : ''}${i[2].trim()}`;
      }
      continue;
    }

    if (mode === 'room_intro' && current.rooms.length > 0) {
      const idx = current.rooms.length - 1;
      current.rooms[idx].room_intro_raw += `${current.rooms[idx].room_intro_raw ? '\n' : ''}${line}`;
    } else {
      current.cruise_intro_raw += `${current.cruise_intro_raw ? '\n' : ''}${line}`;
    }
  }

  if (current) drafts.push(current);
  return drafts;
}

function collectImageFiles(imagesDir) {
  if (!imagesDir || !fs.existsSync(imagesDir)) return [];
  const entries = fs.readdirSync(imagesDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(imagesDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectImageFiles(full));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      files.push(full.replace(/\\/g, '/'));
    }
  }

  return files;
}

function imageMatchesByKeyword(files, keyword, limit = 8) {
  const k = normalizeText(keyword).replace(/\s+/g, '');
  if (!k) return [];

  return files
    .filter((f) => normalizeText(path.basename(f)).replace(/\s+/g, '').includes(k))
    .slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Missing --input');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const text = readInputText(inputPath);
  const drafts = extractCruiseDrafts(text);
  const imageFiles = collectImageFiles(args.images ? path.resolve(process.cwd(), args.images) : '');
  const catalog = await fetchCatalogFromSupabase();

  const output = {
    meta: {
      generated_at: new Date().toISOString(),
      input_file: inputPath.replace(/\\/g, '/'),
      image_dir: args.images || null,
      catalog_source: catalog.source,
      record_count: drafts.length,
    },
    db_mapping: {
      cruise_intro: {
        table: 'cruise_info',
        column: 'description',
      },
      room_intro: {
        table: 'cruise_info',
        column: 'room_description',
      },
      room_images: {
        table: 'cruise_info',
        primary_column: 'room_image',
        multi_image_backup_column: 'images',
      },
    },
    extracted: drafts.map((cruise) => {
      const cruiseCandidates = topCandidates(cruise.cruise_name_raw, catalog.cruiseNames);
      const cruiseImages = imageMatchesByKeyword(imageFiles, cruise.cruise_name_raw, 12);

      return {
        cruise_name_raw: cruise.cruise_name_raw,
        cruise_intro_raw: cruise.cruise_intro_raw,
        cruise_name_candidates: cruiseCandidates,
        cruise_images_candidates: cruiseImages,
        rooms: (cruise.rooms || []).map((room) => {
          const roomCandidates = topCandidates(room.room_name_raw, catalog.roomNames);
          const roomImages = [
            ...imageMatchesByKeyword(imageFiles, `${cruise.cruise_name_raw} ${room.room_name_raw}`, 12),
            ...imageMatchesByKeyword(imageFiles, room.room_name_raw, 12),
          ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 12);

          return {
            room_name_raw: room.room_name_raw,
            room_intro_raw: room.room_intro_raw,
            room_name_candidates: roomCandidates,
            room_images_candidates: roomImages,
          };
        }),
      };
    }),
    next_action: [
      '관리자 검수 UI에서 후보 선택/문구 수정/이미지 제거·추가 후 확정 저장',
      '확정 저장 시 cruise_info.description, cruise_info.room_description, cruise_info.room_image(대표), cruise_info.images(다중) 반영',
    ],
  };

  const outputText = JSON.stringify(output, null, 2);
  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(outPath, outputText, 'utf8');
    console.log(`Saved: ${outPath}`);
  } else {
    console.log(outputText);
  }
}

main().catch((error) => {
  console.error('Extraction failed:', error?.message || error);
  process.exit(1);
});
