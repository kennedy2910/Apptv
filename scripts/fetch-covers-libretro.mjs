/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROMS_DIR = path.join(ROOT, 'roms');
const COVERS_DIR = path.join(ROMS_DIR, 'covers');
const CACHE_PATH = path.join(COVERS_DIR, '.libretro-index.json');

const normalizeKey = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const stripTags = (s) =>
  String(s || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const toTokens = (name) => {
  const base = stripTags(String(name || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const raw = base.split(/[^a-z0-9]+/g).filter(Boolean);

  const stop = new Set([
    'the', 'of', 'and', 'a', 'an',
    'pt', 'br', 'ptbr',
    'usa', 'us', 'europe', 'eur', 'japan', 'jpn',
    'en', 'es', 'fr', 'de', 'it',
    'v', 'ver', 'version',
  ]);

  const toks = [];
  for (const t of raw) {
    const tt = t.replace(/[0-9]+/g, '') || t; // prefer digit-stripped token; fall back to original
    const k = tt.trim();
    if (!k) continue;
    if (stop.has(k)) continue;
    if (k.length <= 2) continue;
    toks.push(k);
  }

  // Prefer longer, more selective tokens.
  toks.sort((a, b) => b.length - a.length);
  return toks.slice(0, 4);
};

const sanitizeFileName = (s) =>
  String(s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 180);

const SYSTEMS = {
  nes: {
    repo: 'libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System',
    exts: new Set(['.nes']),
  },
  snes: {
    repo: 'libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System',
    exts: new Set(['.smc', '.sfc']),
  },
};

const argv = new Set(process.argv.slice(2));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const concArg = process.argv.find(a => a.startsWith('--concurrency='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const CONCURRENCY = concArg ? Math.max(1, Number(concArg.split('=')[1])) : 4;
const DRY = argv.has('--dry');
const REFRESH = argv.has('--refresh');

if (!fs.existsSync(ROMS_DIR)) {
  console.error('[covers] Missing roms/ directory:', ROMS_DIR);
  process.exit(1);
}

fs.mkdirSync(COVERS_DIR, { recursive: true });

const romFiles = fs
  .readdirSync(ROMS_DIR, { withFileTypes: true })
  .filter(d => d.isFile())
  .map(d => d.name)
  .filter(n => {
    const ext = path.extname(n).toLowerCase();
    return SYSTEMS.nes.exts.has(ext) || SYSTEMS.snes.exts.has(ext);
  });

const tasks = romFiles.map(file => {
  const ext = path.extname(file).toLowerCase();
  const system = SYSTEMS.nes.exts.has(ext) ? 'nes' : 'snes';
  const name = file.slice(0, -ext.length);
  return { file, name, system };
});

const candidatesFor = (name) => {
  const a = String(name || '').trim();
  const b = stripTags(a);
  const c = b.replace(/[-_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Try: exact, stripped tags, stripped tags + cleanup.
  const uniq = [];
  for (const x of [a, b, c]) {
    if (!x) continue;
    const k = normalizeKey(x);
    if (!k) continue;
    if (!uniq.some(u => normalizeKey(u) === k)) uniq.push(x);
  }
  return uniq;
};

const ghRawUrl = (repo, filePath) =>
  `https://raw.githubusercontent.com/${repo}/master/${filePath}`;

const ghTreeUrl = (repo) =>
  `https://api.github.com/repos/${repo}/git/trees/master?recursive=1`;

const loadIndex = async () => {
  if (!REFRESH && fs.existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch {
      // ignore
    }
  }

  const index = { nes: {}, snes: {} };

  for (const system of Object.keys(SYSTEMS)) {
    const repo = SYSTEMS[system].repo;
    const url = ghTreeUrl(repo);
    console.log(`[covers] index: fetching ${system} tree from GitHub...`);
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'lineartv-pro-covers-script',
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`GitHub API failed for ${system}: HTTP ${r.status} ${body.slice(0, 200)}`);
    }
    const data = await r.json();
    const tree = Array.isArray(data?.tree) ? data.tree : [];
    for (const node of tree) {
      const p = node?.path;
      if (typeof p !== 'string') continue;
      if (!p.startsWith('Named_Boxarts/')) continue;
      if (!p.toLowerCase().endsWith('.png')) continue;
      const file = p.split('/').pop() || '';
      const base = file.replace(/\.[^.]+$/, '');
      const key = normalizeKey(base);
      if (!key) continue;
      index[system][key] = ghRawUrl(repo, p);
    }
    console.log(`[covers] index: ${system} entries=${Object.keys(index[system]).length}`);
  }

  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(index), 'utf8');
  } catch {
    // ignore cache write
  }

  return index;
};

const download = async (url) => {
  const r = await fetch(url);
  if (!r.ok) return null;
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
};

const bestFuzzyKey = (keys, key, tokens) => {
  if (!key && (!tokens || tokens.length === 0)) return null;

  const k = String(key || '');
  let best = null;
  let bestScore = Infinity;

  const scoreKey = (cand) => {
    // lower score is better
    const dl = Math.abs(cand.length - k.length);
    const starts = (k && cand.startsWith(k)) ? -50 : 0;
    return dl + starts;
  };

  // pass 1: direct containment on normalized key
  if (k) {
    for (const cand of keys) {
      if (!cand.includes(k) && !k.includes(cand)) continue;
      const s = scoreKey(cand);
      if (s < bestScore) { bestScore = s; best = cand; }
    }
    if (best) return best;
  }

  // pass 2: token match (handles 3 vs III, etc)
  const toks = Array.isArray(tokens) ? tokens : [];
  if (toks.length) {
    for (const cand of keys) {
      let ok = true;
      for (const t of toks) {
        if (!cand.includes(t)) { ok = false; break; }
      }
      if (!ok) continue;
      // Prefer the shortest matching key.
      const s = cand.length;
      if (s < bestScore) { bestScore = s; best = cand; }
    }
    if (best) return best;
  }

  return null;
};

const runOne = async (t, index, keyListBySystem) => {
  const sysDir = path.join(COVERS_DIR, t.system);
  fs.mkdirSync(sysDir, { recursive: true });
  const outName = sanitizeFileName(t.name) || sanitizeFileName(t.file);
  const outPath = path.join(sysDir, `${outName}.png`);
  if (fs.existsSync(outPath)) return { ok: true, skipped: true, outPath };

  const candidates = candidatesFor(t.name);
  for (const c of candidates) {
    const k = normalizeKey(c);
    let url = index?.[t.system]?.[k];
    if (!url) {
      const best = bestFuzzyKey(keyListBySystem[t.system], k, toTokens(c));
      if (best) url = index?.[t.system]?.[best];
    }
    if (!url) continue;

    const buf = await download(url);
    if (!buf) continue;

    if (!DRY) fs.writeFileSync(outPath, buf);
    return { ok: true, skipped: false, outPath, url };
  }

  return { ok: false };
};

let ok = 0;
let miss = 0;
let skipped = 0;
let i = 0;

const queue = tasks.slice(0, Number.isFinite(LIMIT) ? LIMIT : tasks.length);
console.log(`[covers] ROMs: ${tasks.length} | queue: ${queue.length} | concurrency: ${CONCURRENCY} | dry: ${DRY} | refresh: ${REFRESH}`);

let index;
try {
  index = await loadIndex();
} catch (e) {
  console.error('[covers] Failed to build index:', String(e?.message || e));
  process.exit(2);
}

const keyListBySystem = {
  nes: Object.keys(index?.nes || {}),
  snes: Object.keys(index?.snes || {}),
};

const workers = Array.from({ length: CONCURRENCY }).map(async () => {
  for (;;) {
    const t = queue[i++];
    if (!t) return;
    const r = await runOne(t, index, keyListBySystem);
    if (r.ok) {
      ok++;
      if (r.skipped) skipped++;
      const extra = r.skipped ? '(skip)' : '(dl)';
      console.log(`[covers] ok ${extra}: ${t.name}`);
    } else {
      miss++;
      console.log(`[covers] miss: ${t.name}`);
    }
  }
});

await Promise.all(workers);
console.log(`[covers] done. ok=${ok} skipped=${skipped} miss=${miss}`);
