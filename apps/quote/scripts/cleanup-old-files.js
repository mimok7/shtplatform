#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Run the typecheck command and capture output
console.log('Running typecheck to find erroring files...');
const res = spawnSync('npm', ['run', '-s', 'typecheck'], { encoding: 'utf8' });
const out = (res.stdout || '') + '\n' + (res.stderr || '');

// Regex to find file paths from tsc output like: path/to/file.tsx:123:45 - error ...
const fileRegex = /(^|\s)([A-Za-z0-9_:\/\\.\- ]+\.(?:ts|tsx|js|jsx)):\d+:\d+/gm;
const found = new Set();
let m;
while ((m = fileRegex.exec(out)) !== null) {
    const p = m[2].trim();
    // normalize windows paths to repo-relative if absolute
    const repoRoot = process.cwd();
    let filePath = p;
    if (path.isAbsolute(p)) {
        // ensure it's inside repo
        if (p.startsWith(repoRoot)) filePath = path.relative(repoRoot, p);
        else continue;
    }
    found.add(filePath.replace(/\\/g, '/'));
}

if (found.size === 0) {
    console.log('No erroring files detected by pattern.');
    process.exit(0);
}

console.log('Files with errors (detected):');
for (const f of found) console.log('  -', f);

// Filter to candidate old files (contains _old or page_old or /old in name)
const oldCandidates = [...found].filter(f => /(^|\/)page_old\.|_old\.|\bold\b/i.test(f));
if (oldCandidates.length === 0) {
    console.log('No `_old` candidates among detected files. Aborting deletion.');
    process.exit(0);
}

console.log('\n_old candidates to be deleted:');
oldCandidates.forEach(f => console.log('  -', f));

// Ask for confirmation from user via env var to allow CI-safe runs
if (process.env.AUTO_DELETE_OLD !== '1') {
    console.log('\nTo actually delete these files, re-run with env AUTO_DELETE_OLD=1');
    process.exit(0);
}

// Delete files
let deleted = 0;
for (const rel of oldCandidates) {
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) {
        try {
            fs.unlinkSync(abs);
            console.log('Deleted', rel);
            deleted++;
        } catch (err) {
            console.error('Failed to delete', rel, err.message || err);
        }
    } else {
        console.log('Not found (skipped):', rel);
    }
}

console.log(`\nDone. Deleted ${deleted} files.`);
process.exit(0);
