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
 * All six below are discharged by the same piece of work: NestJS 10 → 11 (which
 * pulls fixed platform-express/multer/serve-static/path-to-regexp/swagger→lodash)
 * plus nodemailer 8 → 9.
 */
const ALLOWLIST = {
  '@nestjs/platform-express': { task: 'TASK-304', expires: '2026-09-30' },
  '@nestjs/serve-static': { task: 'TASK-304', expires: '2026-09-30' },
  multer: { task: 'TASK-304', expires: '2026-09-30' },
  'path-to-regexp': { task: 'TASK-304', expires: '2026-09-30' },
  lodash: { task: 'TASK-304', expires: '2026-09-30' },
  nodemailer: { task: 'TASK-304', expires: '2026-09-30' },
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
