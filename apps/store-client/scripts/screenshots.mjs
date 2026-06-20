// Visual screenshot harness for the storefront design loop.
//
// Captures key routes at mobile / tablet / desktop viewports so the `designer`
// agent (or a human) can read the rendered output back and iterate on it.
//
// Usage:
//   npm run dev -w apps/store-client            # start the storefront first
//   npm run screenshots -w apps/store-client    # all routes, all viewports
//   npm run screenshots -w apps/store-client -- /products /cart   # only these routes
//
// Config via env:
//   BASE_URL   target origin (default http://localhost:3000)
//   ROUTES     comma-separated routes (overrides defaults; CLI args win over this)
//   VIEWPORTS  comma-separated names from the VIEWPORTS map (default: all)
//
// Output: apps/store-client/.screenshots/<route>__<viewport>.png  (git-ignored)

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n[screenshots] Playwright is not installed.\n' +
      'Install it once with:\n' +
      '  npm i -D playwright -w apps/store-client\n' +
      '  npx playwright install chromium\n',
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '.screenshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const VIEWPORTS = {
  mobile: { width: 390, height: 844 }, // iPhone 14-ish
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

const DEFAULT_ROUTES = [
  '/', // homepage: hero, category nav, featured grid
  '/products', // catalog: filters, grid, pagination
  '/cart', // cart (works for guests)
  '/checkout', // checkout stepper
  '/login', // auth form
];

const cliRoutes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const envRoutes = process.env.ROUTES?.split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const routes = cliRoutes.length ? cliRoutes : (envRoutes ?? DEFAULT_ROUTES);

const viewportNames = (process.env.VIEWPORTS?.split(',').map((v) => v.trim()) ??
  Object.keys(VIEWPORTS)
).filter((name) => VIEWPORTS[name]);

const slug = (route) => (route === '/' ? 'home' : route.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'));

// Keep the directory (and its .gitignore) tracked; only clear stale PNGs.
async function resetOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
  const entries = await readdir(OUT_DIR).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.png'))
      .map((name) => rm(join(OUT_DIR, name), { force: true })),
  );
  // Ensure generated images stay out of git even if the ignore file went missing.
  await writeFile(join(OUT_DIR, '.gitignore'), '*\n!.gitignore\n');
}

async function main() {
  await resetOutDir();

  const browser = await chromium.launch();
  let shotCount = 0;

  for (const name of viewportNames) {
    const context = await browser.newContext({
      viewport: VIEWPORTS[name],
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    for (const route of routes) {
      const url = new URL(route, BASE_URL).toString();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        // settle async data / skeletons
        await page.waitForTimeout(600);
        const file = join(OUT_DIR, `${slug(route)}__${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`  ✓ ${name.padEnd(7)} ${route}  →  ${file}`);
        shotCount += 1;
      } catch (err) {
        console.warn(`  ✗ ${name.padEnd(7)} ${route}  (${err.message})`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n[screenshots] ${shotCount} image(s) written to ${OUT_DIR}`);
  console.log('[screenshots] Read them back with the Read tool to critique the design.\n');
}

main().catch((err) => {
  console.error('[screenshots] fatal:', err);
  process.exit(1);
});
