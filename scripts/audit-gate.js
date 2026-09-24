#!/usr/bin/env node
/**
 * audit-gate — fail CI on any NEW high/critical advisory in the *production*
 * dependency tree, while letting a short, dated, task-linked list of known ones
 * through.
 *
 * Why not just `npm audit --audit-level=high`?
 * Because some advisories have no fix we can take yet (today: one that only a
 * Prisma major clears). A gate that is red on every PR gets ignored within a
 * week, and then it is not a gate at all — it is a red light everyone has learnt
 * to walk through. This keeps the signal: known debt is acknowledged in one
 * place, and anything *else* high/critical fails the build immediately.
 *
 * Three safeguards stop the allowlist from becoming a dumping ground:
 *   - every entry needs a `task`, a `reason` (why it is not exploitable HERE)
 *     and an `expires` date — an entry missing any of them fails the gate;
 *   - past `expires`, the entry stops suppressing and the build goes red;
 *   - an entry that no longer matches any advisory is reported as stale, so it
 *     gets deleted instead of silently waiting to excuse a future regression.
 * So ignoring a vulnerability has a deadline, and forgetting is not an option.
 *
 * Dev-only advisories are out of scope on purpose (`--omit=dev`): test tooling is
 * not reachable by an attacker over the internet. One npm quirk to know when
 * reading the output: npm links every workspace at the root as if it were a
 * production dependency, so `packages/eslint-config` and `packages/orval-config`
 * — devDependencies of the apps — are walked as prod. That is why ESLint and
 * orval advisories show up here at all. `npm explain <pkg>` prints the path.
 *
 * Usage: node scripts/audit-gate.js
 */

const { execSync } = require('child_process');

/**
 * Known, accepted-for-now advisories, keyed by the vulnerable package name.
 *
 * HISTORY — read before re-adding anything that used to live here.
 *
 * TASK-757 (2026-09-24) emptied the list down to the Prisma chain below. The
 * gate had gone red on 14 packages; everything with a same-major fix was closed
 * by upgrading, not by allowlisting:
 *   - next 16.2.12 -> 16.3.6 (critical: unauthenticated RCE in the Image
 *     Optimization API / on Windows hosts). 16.3.6 also pins fixed postcss and
 *     sharp itself, which let the root `overrides.next` block go;
 *   - @nestjs/* 11.2.6 (-> multer 2.4.0), nodemailer 9.1.1, sharp 0.35.4,
 *     @tiptap/* 3.31.3;
 *   - transitive copies lifted in-major: js-yaml 4.3.2 (orval pins 4.3.0 — root
 *     override), mysql2 3.24.4 (prisma pins 3.15.3 — root override),
 *     brace-expansion 1.1.21 / 5.0.12, fast-uri 3.1.8, nanoid 3.3.19.
 *
 * TASK-304's claim that NestJS 11 + nodemailer 9 "discharged" platform-express,
 * multer and nodemailer was true when written and stopped being true when newer
 * advisories landed against the 11.1.x / 9.0.x lines. An upgrade discharges the
 * advisories that exist on that day, not the package forever.
 *
 * The ESLint chain (eslint, @eslint/config-array, @eslint/eslintrc, minimatch,
 * brace-expansion — TASK-343/349) was cleared by brace-expansion's own patch
 * releases (1.1.21, 5.0.12), so eslint 9 stays and nothing was traded away. If
 * it ever comes back with "eslint 10" as the only fix, the TASK-349 findings
 * still hold: eslint-config-next's react / jsx-a11y / import plugins cap eslint
 * at 9, and forcing 10 with an override breaks lint at load time
 * (`contextOrFilename.getFilename is not a function` from eslint-plugin-react).
 *
 * Entry shape: { task, reason, expires: 'YYYY-MM-DD' } — all three required.
 */
const PRISMA_8 = {
  task: 'TASK-757',
  reason:
    'GHSA-ggr8-5vv4-36mx: deepmerge-ts <8 can exhaust the stack merging a RECURSIVE ' +
    'object graph. Its only caller here is @prisma/config merging our own ' +
    'prisma.config.ts when the prisma CLI starts (generate / migrate deploy at ' +
    'container start) — developer-authored input, rcFile/extend disabled, never ' +
    'on a request path; @prisma/client does not load it. Every prisma 7.x ' +
    '(7.10.0 included) pins deepmerge-ts 7.1.5; the fix ships only in prisma 8, a ' +
    'major, still RC on 2026-09-24. Upgrade to prisma 8 stable is its own task.',
  expires: '2026-11-30',
};

const ALLOWLIST = {
  prisma: PRISMA_8,
  '@prisma/config': PRISMA_8,
  'deepmerge-ts': PRISMA_8,
};

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function validateAllowlist() {
  const problems = [];
  for (const [name, entry] of Object.entries(ALLOWLIST)) {
    if (!/^TASK-\d+$/.test(entry.task ?? '')) problems.push(`${name}: missing/invalid task`);
    if (!(entry.reason ?? '').trim()) problems.push(`${name}: missing reason`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')) {
      problems.push(`${name}: missing/invalid expires (YYYY-MM-DD)`);
    }
  }
  return problems;
}

function readAudit() {
  try {
    // `npm audit` exits non-zero when it finds anything, so a throw here is the
    // normal path — the JSON we want is still on stdout.
    // execSync (a fixed command string, no interpolation) rather than execFileSync:
    // on Windows, npm is a `.cmd` shim, and Node >=22 refuses to execFile a `.cmd`
    // without a shell (EINVAL). There is no user input in this string, so a shell
    // costs nothing here.
    const out = execSync('npm audit --omit=dev --json', {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

const malformed = validateAllowlist();
if (malformed.length) {
  console.error('Malformed ALLOWLIST entries in scripts/audit-gate.js:');
  for (const p of malformed) console.error(`  - ${p}`);
  process.exit(1);
}

const audit = readAudit();
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const suppressed = [];
const expired = [];
const matched = new Set();

for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;

  const allowed = ALLOWLIST[vuln.name];
  if (!allowed) {
    blocking.push(vuln);
  } else if (allowed.expires < today) {
    matched.add(vuln.name);
    expired.push({ vuln, allowed });
  } else {
    matched.add(vuln.name);
    suppressed.push({ vuln, allowed });
  }
}

const stale = Object.keys(ALLOWLIST).filter((name) => !matched.has(name));

const line = (v) => `  - ${v.name} [${v.severity}]`;

if (suppressed.length) {
  console.log(`Known advisories, accepted until their deadline (${suppressed.length}):`);
  for (const { vuln, allowed } of suppressed) {
    console.log(`${line(vuln)} — ${allowed.task}, expires ${allowed.expires}`);
  }
  console.log('');
}

if (stale.length) {
  // Not a failure: an upstream fix landing must not turn CI red. But an entry
  // that suppresses nothing today would silently excuse a regression tomorrow,
  // so it is called out for deletion.
  console.log(`STALE allowlist entries — nothing high/critical matches them any more;`);
  console.log(`delete them from scripts/audit-gate.js (${stale.length}):`);
  for (const name of stale) console.log(`  - ${name} (${ALLOWLIST[name].task})`);
  console.log('');
}

if (expired.length) {
  console.error(`EXPIRED exemptions — the deadline to fix these has passed (${expired.length}):`);
  for (const { vuln, allowed } of expired) {
    console.error(`${line(vuln)} — ${allowed.task}, expired ${allowed.expires}`);
  }
  console.error('');
}

if (blocking.length) {
  console.error(`NEW high/critical advisories in production dependencies (${blocking.length}):`);
  for (const vuln of blocking) console.error(line(vuln));
  console.error('');
  console.error('Fix them — an in-major upgrade first, a root `overrides` entry when a');
  console.error('parent pins an exact vulnerable version — or, only if genuinely not');
  console.error('exploitable here, add an ALLOWLIST entry in scripts/audit-gate.js with');
  console.error('a task, a reason and an expiry date.');
}

if (blocking.length || expired.length) process.exit(1);

console.log('No new high/critical advisories in production dependencies.');
