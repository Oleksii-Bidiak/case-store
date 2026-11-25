// Tests for scripts/bundle-size.js (TASK-2524).
//
// Run: node --test scripts/__tests__/bundle-size.test.js
//
// The script reads a real `next build` output, so these tests build a tiny
// fake `.next` in a temp dir: prerendered HTML with script tags, the chunk
// files they point at, and a route-bundle-stats.json for a dynamic route.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { scriptSources, findPrerenderedHtml, measure } = require('../bundle-size.js');

function fakeNext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-size-'));
  const chunks = path.join(dir, 'static', 'chunks');
  fs.mkdirSync(chunks, { recursive: true });
  fs.writeFileSync(path.join(chunks, 'a.js'), 'var a = 1;'.repeat(200));
  fs.writeFileSync(path.join(chunks, 'b.js'), 'var b = 2;'.repeat(100));
  fs.writeFileSync(path.join(chunks, 'poly.js'), 'var p = 3;'.repeat(500));

  const app = path.join(dir, 'server', 'app');
  fs.mkdirSync(path.join(app, '(auth)'), { recursive: true });
  const tags =
    '<script src="/_next/static/chunks/a.js" async=""></script>' +
    '<script src="/_next/static/chunks/b.js"></script>' +
    '<script src="/_next/static/chunks/a.js"></script>' +
    '<script src="/_next/static/chunks/poly.js" noModule=""></script>' +
    '<script>self.__next_f=[]</script>';
  fs.writeFileSync(path.join(app, 'index.html'), `<html>${tags}</html>`);
  fs.writeFileSync(path.join(app, '(auth)', 'login.html'), `<html>${tags}</html>`);

  fs.mkdirSync(path.join(dir, 'diagnostics'));
  fs.writeFileSync(
    path.join(dir, 'diagnostics', 'route-bundle-stats.json'),
    JSON.stringify([
      { route: '/products/[slug]', firstLoadChunkPaths: ['.next\\static\\chunks\\a.js'] },
    ]),
  );
  return dir;
}

const gz = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;

test('scriptSources: unique external scripts, noModule and inline skipped', () => {
  const html =
    '<script src="/x.js"></script><script src="/x.js"></script>' +
    '<script src="/p.js" noModule=""></script><script>inline()</script>' +
    '<script async="" src="/y.js"></script>';
  assert.deepEqual(scriptSources(html), ['/x.js', '/y.js']);
});

test('findPrerenderedHtml: route groups are dropped, index is /', () => {
  const dir = fakeNext();
  const routes = findPrerenderedHtml(path.join(dir, 'server', 'app'));
  assert.ok(routes.has('/'));
  assert.ok(routes.has('/login'));
});

test('measure: HTML for static pages, bundle stats for dynamic ones', () => {
  const dir = fakeNext();
  const chunks = path.join(dir, 'static', 'chunks');
  const rows = measure(dir, [
    { route: '/login', budgetKb: 300 },
    { route: '/products/[slug]', budgetKb: null },
  ]);
  const expectedLogin = (gz(path.join(chunks, 'a.js')) + gz(path.join(chunks, 'b.js'))) / 1024;
  assert.equal(rows[0].source, 'html');
  assert.equal(rows[0].files, 2);
  assert.ok(Math.abs(rows[0].kb - expectedLogin) < 1e-9);
  assert.equal(rows[1].source, 'stats');
  assert.ok(Math.abs(rows[1].kb - gz(path.join(chunks, 'a.js')) / 1024) < 1e-9);
});

test('measure: a page with neither HTML nor stats is an error, not a zero', () => {
  const dir = fakeNext();
  assert.throws(() => measure(dir, [{ route: '/nowhere', budgetKb: 1 }]), /no prerendered HTML/);
});
