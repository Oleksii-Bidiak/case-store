// Guard for .dockerignore (TASK-2550).
//
// Run: node --test scripts/__tests__/dockerignore-routes.test.js
//
// The build context of all three images is the monorepo root, filtered by one
// root-level .dockerignore. Its patterns are written for build output
// (`**/coverage`, `**/dist`, `**/out`, `**/build`), but they match SOURCE
// directories with the same name just as well. `/devices/models/[id]/coverage`
// is an app-router route: it was dropped from the admin image without any error
// and answered 404 only on the server. This test fails as soon as any directory
// under an app's `src/` is excluded from the build context.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** .dockerignore lines as `{ negate, regex }`, in file order. */
function readPatterns() {
  return fs
    .readFileSync(path.join(ROOT, '.dockerignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!');
      const glob = (negate ? line.slice(1) : line).replace(/^\/+|\/+$/g, '');
      const source = glob
        .split(/(\*\*\/|\*\*|\*|\?)/)
        .map((part) => {
          if (part === '**/') return '(?:.*/)?';
          if (part === '**') return '.*';
          if (part === '*') return '[^/]*';
          if (part === '?') return '[^/]';
          return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
      return { negate, regex: new RegExp(`^${source}$`) };
    });
}

/**
 * Docker's rule: the last pattern that matches the path — or any of its parent
 * directories — decides; a `!` pattern re-includes.
 */
function isIgnored(relPath, patterns) {
  const parts = relPath.split('/');
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  let ignored = false;
  for (const { negate, regex } of patterns) {
    if (candidates.some((candidate) => regex.test(candidate))) ignored = !negate;
  }
  return ignored;
}

function sourceDirs() {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      // Test folders are excluded from images on purpose.
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      const childRel = `${rel}/${entry.name}`;
      out.push(childRel);
      walk(path.join(abs, entry.name), childRel);
    }
  };
  for (const app of fs.readdirSync(path.join(ROOT, 'apps'))) {
    const src = path.join(ROOT, 'apps', app, 'src');
    if (fs.existsSync(src)) walk(src, `apps/${app}/src`);
  }
  return out;
}

test('the matcher follows .dockerignore semantics', () => {
  const patterns = readPatterns();
  assert.equal(isIgnored('apps/store-api/coverage/lcov.info', patterns), true);
  assert.equal(isIgnored('apps/store-client/.next/server/app.js', patterns), true);
  assert.equal(isIgnored('apps/store-api/src/main.ts', patterns), false);
  assert.equal(isIgnored('apps/store-api/src/cart/cart.service.spec.ts', patterns), true);
});

test('no source directory of an app is dropped from the Docker build context', () => {
  const patterns = readPatterns();
  const dropped = sourceDirs().filter((dir) => isIgnored(dir, patterns));
  assert.deepEqual(
    dropped,
    [],
    `These source directories match a .dockerignore pattern and would be missing from the image:\n  ${dropped.join('\n  ')}\nAdd a "!" exception next to the pattern, as for the coverage route.`,
  );
});

test('a file inside the coverage route is part of the build context', () => {
  const patterns = readPatterns();
  const page = 'apps/store-admin/src/app/(dashboard)/devices/models/[id]/coverage/page.tsx';
  assert.equal(fs.existsSync(path.join(ROOT, page)), true);
  assert.equal(isIgnored(page, patterns), false);
});
