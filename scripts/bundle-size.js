#!/usr/bin/env node
/**
 * bundle-size — first-load JavaScript of the storefront, gzipped (TASK-2524).
 *
 * WHY
 * ---
 * The 2026-11-18 audit found every storefront page loading ~630 kB of gzipped
 * JavaScript — `/login` as much as `/checkout` — because the root layout pulled
 * the whole widget layer into its shared chunk. Nothing in CI watched the
 * number, so it grew unnoticed. This script is the watch: it fails when a
 * budgeted page goes over its limit. CI runs it right after `npm run build`.
 *
 * HOW IT COUNTS
 * -------------
 * Static and ISR pages: the unique `<script src>` tags of the prerendered HTML
 * in `.next/server/app/**.html` — exactly what a browser fetches on the first
 * visit. Each file is gzipped (level 9, close to what Caddy serves) and summed.
 * Dynamic pages (the product page) have no prerendered HTML, so they fall back
 * to `firstLoadChunkPaths` from `.next/diagnostics/route-bundle-stats.json`,
 * which Next writes for every route. Inline scripts (RSC payload, theme guard)
 * are not counted: they are part of the HTML, not of the bundle.
 *
 * USAGE
 * -----
 *   npm run build -w apps/store-client && npm run bundle-size
 *   node scripts/bundle-size.js --limit=250   # override every budget (kB)
 *
 * Exit code 0 = every budget met; 1 = a budget exceeded; 2 = could not run
 * (no build, a missing page or chunk).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const APP_DIR = path.join(__dirname, '..', 'apps', 'store-client');
const NEXT_DIR = path.join(APP_DIR, '.next');

/**
 * Pages and their budgets, gzip kB. A RATCHET, not the goal: each budget is
 * what TASK-2524 reached (2026-11-25), rounded up, so any growth fails CI. The
 * goal is 300 kB for `/` and `/login`; the remaining ~60 kB are the dictionary
 * and axios (TASK-2586, TASK-2587). When a change makes a page lighter, lower
 * its budget in the same commit.
 */
const PAGES = [
  { route: '/', budgetKb: 360 },
  { route: '/login', budgetKb: 335 },
  { route: '/cart', budgetKb: 345 },
  { route: '/checkout', budgetKb: 375 },
  { route: '/categories', budgetKb: 310 },
  { route: '/products/[slug]', budgetKb: 365 },
];

function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

/**
 * Unique external script URLs of an HTML document, in document order. A
 * `noModule` script (Next's legacy polyfills) is skipped: every browser that
 * runs the storefront's ES modules ignores it and never downloads it.
 */
function scriptSources(html) {
  const sources = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = match[1];
    if (/\bnomodule\b/i.test(attrs)) continue;
    const src = /\bsrc="([^"]+)"/.exec(attrs);
    if (src && !sources.includes(src[1])) sources.push(src[1]);
  }
  return sources;
}

/** Route → prerendered HTML file, ignoring `(group)` folders. */
function findPrerenderedHtml(serverAppDir) {
  const byRoute = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        const rel = path
          .relative(serverAppDir, full)
          .replace(/\\/g, '/')
          .replace(/\.html$/, '')
          .split('/')
          .filter((segment) => !/^\(.*\)$/.test(segment))
          .join('/');
        byRoute.set(rel === 'index' ? '/' : `/${rel}`, full);
      }
    }
  };
  walk(serverAppDir);
  return byRoute;
}

/** `/_next/static/chunks/a.js` or `.next\static\chunks\a.js` → file on disk. */
function chunkFile(nextDir, ref) {
  const normalized = ref.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const rel = normalized.replace(/^\/_next\//, '').replace(/^\.next\//, '');
  return path.join(nextDir, rel);
}

function measureFiles(nextDir, refs) {
  let bytes = 0;
  for (const ref of refs) {
    const file = chunkFile(nextDir, ref);
    if (!fs.existsSync(file)) throw new Error(`chunk not found: ${ref}`);
    bytes += gzipSize(fs.readFileSync(file));
  }
  return bytes;
}

function measure(nextDir, pages) {
  const htmlByRoute = findPrerenderedHtml(path.join(nextDir, 'server', 'app'));
  const statsFile = path.join(nextDir, 'diagnostics', 'route-bundle-stats.json');
  const stats = fs.existsSync(statsFile)
    ? new Map(JSON.parse(fs.readFileSync(statsFile, 'utf8')).map((r) => [r.route, r]))
    : new Map();

  return pages.map(({ route, budgetKb }) => {
    const html = htmlByRoute.get(route);
    let refs;
    let source;
    if (html) {
      refs = scriptSources(fs.readFileSync(html, 'utf8'));
      source = 'html';
    } else if (stats.has(route)) {
      refs = stats.get(route).firstLoadChunkPaths;
      source = 'stats';
    } else {
      throw new Error(`no prerendered HTML and no bundle stats for ${route}`);
    }
    const bytes = measureFiles(nextDir, refs);
    return { route, source, files: refs.length, kb: bytes / 1024, budgetKb };
  });
}

function main(argv) {
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const override = limitArg ? Number(limitArg.slice('--limit='.length)) : null;
  if (limitArg && !(override > 0)) {
    console.error(`bundle-size: invalid ${limitArg}`);
    return 2;
  }
  if (!fs.existsSync(path.join(NEXT_DIR, 'BUILD_ID'))) {
    console.error('bundle-size: no build — run `npm run build -w apps/store-client` first');
    return 2;
  }

  const pages = PAGES.map((page) => ({ ...page, budgetKb: override ?? page.budgetKb }));
  let rows;
  try {
    rows = measure(NEXT_DIR, pages);
  } catch (error) {
    console.error(`bundle-size: ${error.message}`);
    return 2;
  }

  let failed = false;
  console.log('route                 files   gzip kB   budget');
  for (const row of rows) {
    const over = row.budgetKb !== null && row.kb > row.budgetKb;
    failed ||= over;
    console.log(
      `${row.route.padEnd(20)} ${String(row.files).padStart(6)} ${row.kb.toFixed(1).padStart(9)}   ` +
        `${row.budgetKb === null ? '—' : `${row.budgetKb}${over ? '  ✗ OVER' : '  ✓'}`}` +
        `${row.source === 'stats' ? '   (route-bundle-stats)' : ''}`,
    );
  }
  if (failed) console.error('bundle-size: budget exceeded (TASK-2524)');
  return failed ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { scriptSources, findPrerenderedHtml, chunkFile, measure, main };
