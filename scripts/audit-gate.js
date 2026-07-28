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
 * WHY IT IS NOT SIMPLY FIXED (re-investigated under TASK-349 — the earlier note
 * here was WRONG on both the cause and the cure; corrected below).
 *
 * The only fix npm offers is eslint 10. Three plugins cap us at eslint 9, and
 * ALL THREE are hard `dependencies` of `eslint-config-next` (16.2.4 and 16.2.12
 * alike), so none of them is ours to migrate:
 *
 *   eslint-plugin-import   2.32.0 (latest)  peer eslint: ^2 … ^9
 *   eslint-plugin-react    7.37.5 (latest)  peer eslint: ^3 … ^9.7
 *   eslint-plugin-jsx-a11y 6.10.2 (latest)  peer eslint: ^3 … ^9
 *
 * THE OLD NOTE'S PREMISE WAS FALSE: `eslint-plugin-import` does NOT enforce this
 * repo's FSD import-direction rules. Those are plain core `no-restricted-imports`
 * blocks in each frontend's own `eslint.config.mjs`; `eslint --print-config`
 * shows the only active import rule anywhere is `import/no-anonymous-default-export`
 * (a warning, set by eslint-config-next itself). So "migrate to
 * eslint-plugin-import-x" — the cure the old note prescribed — buys nothing: it
 * cannot remove eslint-config-next's own copy, and even a total removal would
 * still leave eslint-plugin-react and eslint-plugin-jsx-a11y holding eslint at 9.
 * The two unused direct `eslint-plugin-import` devDependencies that made it look
 * like ours were dropped in TASK-349.
 *
 * WHAT AN `overrides: { eslint: "^10" }` ESCAPE HATCH ACTUALLY BUYS: a clean
 * audit and no working lint.
 *
 * The peer ranges above are not what stops it. Overrides exist precisely to
 * force a tree past a peer deadlock, and they do — the chain moves to eslint 10
 * and these advisories clear. The blocker is one step later, at runtime.
 * eslint-plugin-react 7.37.5 calls `context.getFilename()`, which ESLint 10
 * removed, from `lib/util/version.js:31` (`resolveBasedir`) — the React-version
 * detection that every `react/*` rule runs when it loads. The first lint after
 * the override dies with:
 *
 *   TypeError: Error while loading rule 'react/display-name':
 *              contextOrFilename.getFilename is not a function
 *
 * Both call sites (that one and `lib/rules/jsx-filename-extension.js:64`) are
 * present in the installed copy today — `grep -rn getFilename
 * node_modules/eslint-plugin-react/lib` re-checks it in seconds with no
 * reinstall. Trading a working lint for a dev-only DoS advisory that ships in no
 * image is the wrong way round, so: not now.
 *
 * (An earlier revision of this note claimed the override yields FOUR eslint
 * copies with 9.39.5 surviving at the root, and concluded the ALLOWLIST could
 * not shrink at all. That is not how overrides resolve and it did not
 * reproduce. Corrected in place rather than deleted, so the next person does
 * not re-run that experiment expecting the old answer.)
 *
 * WHAT ACTUALLY DISCHARGES THIS — upstream, not us:
 *   1. an `eslint-config-next` release whose react / jsx-a11y / import plugins
 *      accept eslint 10 (watch it on every `next` bump — this is the cheap path);
 *   2. failing that, dropping `eslint-config-next` and composing the frontend
 *      config by hand from @next/eslint-plugin-next + eslint-plugin-react-hooks
 *      (already `^10`-ready) + typescript-eslint (already `^10`-ready). That
 *      trades away the react and jsx-a11y rulesets — and a11y is an explicit
 *      project rule (AGENTS.md §Frontend Conventions) — to close a DoS that is
 *      dev-only and not present in any shipped image. Do not do it silently.
 * Aliasing (`"eslint-plugin-import": "npm:eslint-plugin-import-x@^4"`) was
 * considered and rejected: import-x reads its settings from `import-x/*` keys
 * while eslint-config-next writes `import/resolver` + `import/parsers`, so the
 * resolver config would be silently ignored — and it still would not move
 * react / jsx-a11y.
 */
const ALLOWLIST = {
  // Dev-only lint toolchain, blocked upstream in eslint-config-next — see above.
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
