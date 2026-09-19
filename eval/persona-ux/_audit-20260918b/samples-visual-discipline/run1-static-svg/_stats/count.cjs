// Per-directory line statistics for .ts/.js/.css/.html
// Usage: node count.js
const fs = require('fs');
const path = require('path');

const ROOT = '.';
const EXTS = new Set(['.ts', '.js', '.css', '.html']);
// '_stats' holds this script + its output; 'linecount-report.html' is this task's deliverable.
// Both are excluded so the count describes the project, not the measurement.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '_stats']);
const SKIP_FILES = new Set(['linecount-report.html']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      if (EXTS.has(path.extname(e.name))) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// Line classification: blank / comment-only / code
function classify(text) {
  const rawLines = text.split('\n');
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop(); // drop trailing-newline artifact
  let blank = 0, comment = 0, code = 0;
  let inBlock = false;
  for (const line of rawLines) {
    const t = line.trim();
    if (inBlock) {
      comment++;
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t === '') { blank++; continue; }
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') ||
        t.startsWith('<!--') || t.startsWith('-->')) {
      comment++;
      if (t.startsWith('/*') && !t.includes('*/')) inBlock = true;
      if (t.startsWith('<!--') && !t.includes('-->')) inBlock = true;
      continue;
    }
    code++;
  }
  return { total: rawLines.length, blank, comment, code };
}

const files = walk(ROOT, []).map(f => f.replace(/\\/g, '/')).sort();

const perDir = new Map();        // dir -> direct-file aggregates
const root = { files: 0, total: 0, code: 0, blank: 0, comment: 0, byExt: {} };
const allFiles = [];

function bucketInit() {
  return { files: 0, total: 0, code: 0, blank: 0, comment: 0, byExt: {} };
}
function add(b, ext, s) {
  b.files++; b.total += s.total; b.code += s.code; b.blank += s.blank; b.comment += s.comment;
  b.byExt[ext] = b.byExt[ext] || { files: 0, total: 0, code: 0 };
  b.byExt[ext].files++; b.byExt[ext].total += s.total; b.byExt[ext].code += s.code;
}

for (const f of files) {
  const dir = path.posix.dirname(f);
  const ext = path.extname(f);
  const text = fs.readFileSync(f, 'utf8');
  const s = classify(text);
  const rec = { file: f, dir, ext, ...s };
  allFiles.push(rec);
  if (!perDir.has(dir)) perDir.set(dir, bucketInit());
  add(perDir.get(dir), ext, s);
  add(root, ext, s);
}

// Recursive totals per directory
const dirs = [...perDir.keys()].sort();
function recursive(d) {
  const b = bucketInit();
  const prefix = d === '.' ? '' : d + '/';
  for (const rec of allFiles) {
    if (d === '.' || rec.dir === d || rec.dir.startsWith(prefix)) add(b, rec.ext, rec);
  }
  return b;
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  totals: root,
  direct: {}, recursive: {},
};
for (const d of dirs) {
  out.direct[d] = perDir.get(d);
  out.recursive[d] = recursive(d);
}
fs.writeFileSync('_stats/stats.json', JSON.stringify({ out, allFiles }, null, 1));

// console report
const fmt = n => String(n).padStart(7);
console.log('=== DIRECT (files physically in this directory) ===');
console.log('dir'.padEnd(24) + 'files' + '   total' + '    code' + '   blank' + ' comment');
for (const d of dirs) {
  const b = perDir.get(d);
  console.log(d.padEnd(24) + fmt(b.files) + fmt(b.total) + fmt(b.code) + fmt(b.blank) + fmt(b.comment));
}
console.log('dir'.padEnd(24) + fmt(root.files) + fmt(root.total) + fmt(root.code) + fmt(root.blank) + fmt(root.comment) + '  <- TOTAL');

console.log('\n=== RECURSIVE (includes subdirectories) ===');
for (const d of dirs) {
  const b = out.recursive[d];
  console.log(d.padEnd(24) + fmt(b.files) + fmt(b.total) + fmt(b.code) + fmt(b.blank) + fmt(b.comment));
}

console.log('\n=== TOP-LEVEL (depth 1) RECURSIVE ===');
const top = new Set();
for (const rec of allFiles) top.add(rec.dir === '.' ? '(root)' : rec.dir.split('/')[0]);
for (const t of [...top].sort()) {
  const b = bucketInit();
  for (const rec of allFiles) {
    const k = rec.dir === '.' ? '(root)' : rec.dir.split('/')[0];
    if (k === t) add(b, rec.ext, rec);
  }
  console.log(t.padEnd(24) + fmt(b.files) + fmt(b.total) + fmt(b.code) + fmt(b.blank) + fmt(b.comment));
}
