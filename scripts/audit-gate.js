#!/usr/bin/env node
/**
 * audit-gate — fail CI on any NEW high/critical advisory in the *production*
 * dependency tree, while letting a short, dated, task-linked list of known ones
 * through.
 *
 * Why not just `npm audit --audit-level=high`?
 * Because today it is red: six advisories are pending the NestJS 10 → 11 upgrade
 * (TASK-304). A gate that is red on every PR from day one gets ignored within a
 * week, and then it is not a gate at all — it is a red light everyone has learnt
 * to walk through. This keeps the signal: known debt is acknowledged in one
 * place, and anything *else* high/critical fails the build immediately.
 *
 * Two safeguards stop the allowlist from becoming a dumping ground:
 *   - every entry needs a `task` and an `expires` date;
 *   - past `expires`, the entry stops suppressing and the build goes red.
 * So ignoring a vulnerability has a deadline, and forgetting is not an option.
 *
 * Dev-only advisories are out of scope on purpose (`--omit=dev`): test tooling is
 * not reachable by an attacker over the internet.
 *
 * Usage: node scripts/audit-gate.js
 */

const { execSync } = require('child_process');

/**
 * Known, accepted-for-now advisories, keyed by the vulnerable package name.
 *
 * The six NestJS-10 entries that used to live here are GONE: TASK-304 shipped
 * NestJS 11 + nodemailer 9, which discharged @nestjs/platform-express,
 * @nestjs/serve-static, multer, path-to-regexp, lodash (via @nestjs/swagger 11)
 * and nodemailer in a single move, ahead of their 2026-09-30 deadline.
 *
 * THE ESLINT CHAIN (eslint, @eslint/config-array, @eslint/eslintrc, minimatch,
 * brace-expansion) is a separate, newly published advisory — a DoS in
 * `brace-expansion` reachable only by feeding a malicious glob to minimatch,
 * i.e. by running ESLint. It is not reachable from the deployed API or either
 * frontend: no runtime image contains ESLint (the Dockerfiles install
 * --omit=dev). This is a NEW entry with its own deadline, not a renewal.
 *
 * It surfaces under `--omit=dev` only because of an npm quirk: npm links every
 * workspace at the root as if it were a production dependency, so
 * `packages/eslint-config` — a devDependency of the three apps — is walked as
 * prod, dragging typescript-eslint → @typescript-eslint/utils →
 * @eslint-community/eslint-utils → its peer `eslint` into the "production"
 * tree. `npm explain eslint` prints the path.
 *
 * WHY IT IS NOT SIMPLY FIXED: the only fix npm offers is eslint 10, and
 * `eslint-plugin-import` — including the latest 2.32.0 — still declares
 * `peerDependencies.eslint: "^2 || … || ^9"`. That plugin enforces this repo's
 * FSD import-direction rules (AGENTS.md), so it cannot just be dropped: the real
 * fix is migrating to the maintained `eslint-plugin-import-x` fork and then
 * taking eslint 10. That is a lint-config change with its own blast radius and
 * is deliberately not bundled with a framework major.
 */
const ALLOWLIST = {
  // Dev-only lint toolchain — see the note above. Needs eslint-plugin-import-x.
  eslint: { task: 'TASK-343', expires: '2026-10-31' },
  '@eslint/config-array': { task: 'TASK-343', expires: '2026-10-31' },
  '@eslint/eslintrc': { task: 'TASK-343', expires: '2026-10-31' },
  minimatch: { task: 'TASK-343', expires: '2026-10-31' },
  'brace-expansion': { task: 'TASK-343', expires: '2026-10-31' },
};

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

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

const audit = readAudit();
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const suppressed = [];
const expired = [];

for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;

  const allowed = ALLOWLIST[vuln.name];
  if (!allowed) {
    blocking.push(vuln);
  } else if (allowed.expires < today) {
    expired.push({ vuln, allowed });
  } else {
    suppressed.push({ vuln, allowed });
  }
}

const line = (v) => `  - ${v.name} [${v.severity}]`;

if (suppressed.length) {
  console.log(`Known advisories, accepted until their deadline (${suppressed.length}):`);
  for (const { vuln, allowed } of suppressed) {
    console.log(`${line(vuln)} — ${allowed.task}, expires ${allowed.expires}`);
  }
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
  console.error('Fix them, or — if genuinely not exploitable here — add an entry to');
  console.error('ALLOWLIST in scripts/audit-gate.js with a task and an expiry date.');
}

if (blocking.length || expired.length) process.exit(1);

console.log('No new high/critical advisories in production dependencies.');
