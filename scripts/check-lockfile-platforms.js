#!/usr/bin/env node
/**
 * check-lockfile-platforms — fail the build when package-lock.json is missing the
 * Linux native binaries that a Linux build (CI runners, every Docker image) needs.
 *
 * THE BUG THIS EXISTS TO PREVENT (TASK-326)
 * -----------------------------------------
 * `lightningcss` and `@tailwindcss/oxide` ship their native addon as a set of
 * per-platform optional packages (`…-win32-x64-msvc`, `…-linux-x64-gnu`, …) and
 * pick one at require() time. npm only records the optional deps that were
 * INSTALLABLE on the machine that resolved the tree. This lockfile is maintained
 * on Windows, so it recorded ONLY the `-win32-x64-msvc` entries — and `npm ci` on
 * ubuntu, which installs strictly what the lockfile lists, therefore installed no
 * addon at all. `next build` then died with:
 *
 *     Cannot find module '../lightningcss.linux-x64-gnu.node'
 *
 * Both frontend images failed to build. The fix is the root `optionalDependencies`
 * block in package.json, which names the Linux packages explicitly so they are
 * recorded regardless of who ran `npm install`.
 *
 * WHY A GATE AND NOT JUST THE FIX
 * -------------------------------
 * The one-off lockfile edit is not durable: the next `npm install` on Windows can
 * prune those entries straight back out, silently, and nobody notices until a
 * deploy fails. This script is the durable half.
 *
 * WHY IT ALSO COMPARES VERSIONS
 * -----------------------------
 * Presence alone is not enough. The child packages are version-locked to their
 * parent (lightningcss@1.32.0 loads lightningcss-linux-x64-gnu@1.32.0 and nothing
 * else). Bumping Tailwind or lightningcss without bumping the pin would leave a
 * stale-but-present entry — the same outage wearing a different hat. So every pair
 * is checked three ways: the child exists, its version equals the parent's, and the
 * pin in package.json's optionalDependencies equals it too.
 *
 * SCOPE / KNOWN LIMITATION
 * ------------------------
 * Only linux-x64-gnu is pinned. NOT covered:
 *   - musl (alpine) — the frontend images deliberately use node:22-slim (glibc);
 *   - arm64 — an ARM host (Hetzner CAX/Ampere, Apple Silicon CI) would fail the
 *     exact same way. Deploy targets must stay x86-64 until those are pinned too.
 *
 * Usage: node scripts/check-lockfile-platforms.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const PKG_PATH = path.join(ROOT, 'package.json');

/**
 * Parent package → the Linux native binary it needs at runtime.
 *
 * Only packages whose Linux binary is ACTUALLY MISSING from a Windows-resolved
 * tree belong here. @next/swc, @swc/core and sharp already record every platform
 * (their publishers list all of them as optionalDependencies of the parent, which
 * npm resolves regardless of host), so they need no pin — and adding them would
 * make this gate look like it covers more than it does.
 */
const REQUIRED_PAIRS = [
  { parent: 'lightningcss', child: 'lightningcss-linux-x64-gnu' },
  { parent: '@tailwindcss/oxide', child: '@tailwindcss/oxide-linux-x64-gnu' },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${path.relative(ROOT, file)}: ${err.message}`);
    process.exit(1);
  }
}

const lock = readJson(LOCK_PATH);
const pkg = readJson(PKG_PATH);

const lockPackages = lock.packages ?? {};
const pkgOptional = pkg.optionalDependencies ?? {};
const lockRootOptional = lockPackages['']?.optionalDependencies ?? {};

const problems = [];
const ok = [];

for (const { parent, child } of REQUIRED_PAIRS) {
  const parentEntry = lockPackages[`node_modules/${parent}`];
  if (!parentEntry) {
    problems.push(
      `UNKNOWN  ${parent} — not in the lockfile at all. If it was removed on purpose, ` +
        `drop its entry from REQUIRED_PAIRS in this script.`,
    );
    continue;
  }

  const expected = parentEntry.version;
  const childEntry = lockPackages[`node_modules/${child}`];

  if (!childEntry) {
    problems.push(
      `MISSING  ${child} — ${parent}@${expected} is in the lockfile but its Linux ` +
        `binary is not. A Linux \`npm ci\` will install no native addon and the ` +
        `Next build will fail at require() time.`,
    );
  } else if (childEntry.version !== expected) {
    problems.push(
      `MISMATCH ${child}@${childEntry.version} does not match ${parent}@${expected}. ` +
        `The addon is version-locked to its parent; a mismatch fails to load.`,
    );
  }

  // The pin in package.json is what keeps the lockfile entry alive across a
  // re-resolve. A present lock entry with a stale/absent pin is a bug waiting to
  // reappear the next time somebody runs `npm install` on Windows.
  const pinned = pkgOptional[child];
  if (!pinned) {
    problems.push(
      `UNPINNED ${child} is not in root package.json "optionalDependencies". Without ` +
        `the pin the next \`npm install\` on Windows will prune it from the lockfile again.`,
    );
  } else if (pinned !== expected) {
    problems.push(
      `DRIFT    package.json pins ${child}@${pinned} but ${parent} is ${expected}. ` +
        `Pin the exact parent version (no range).`,
    );
  } else if (lockRootOptional[child] !== expected) {
    problems.push(
      `STALE    the lockfile's root optionalDependencies records ${child}@` +
        `${lockRootOptional[child] ?? '<absent>'} but package.json pins ${expected}. ` +
        `Run \`npm install\` to re-sync the lockfile.`,
    );
  }

  if (!problems.some((p) => p.includes(child))) {
    ok.push(`OK       ${child}@${expected} (matches ${parent}@${expected})`);
  }
}

for (const line of ok) console.log(line);

if (problems.length === 0) {
  console.log('');
  console.log('Lockfile carries every required linux-x64-gnu native binary.');
  process.exit(0);
}

console.error('');
console.error(`Lockfile is not Linux-buildable (${problems.length} problem(s)):`);
console.error('');
for (const line of problems) console.error(`  ${line}`);
console.error('');
console.error('To fix: make sure root package.json "optionalDependencies" pins each');
console.error('missing package to its parent\'s EXACT version, then run `npm install`');
console.error('and commit the updated package-lock.json.');
console.error('');
console.error('optionalDependencies — NOT devDependencies: a devDependency whose `os`');
console.error('field excludes the host breaks `npm install` on Windows with EBADPLATFORM.');
process.exit(1);
