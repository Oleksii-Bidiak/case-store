#!/usr/bin/env node
/**
 * forgot-password-timing — does the password-reset request leak whether an email
 * is registered, through how long it takes to answer? (TASK-452, run in TASK-457)
 *
 * WHY: `POST /api/auth/password-reset/request` answers the same 200 and the same
 * sentence for every email (existence-hiding). The body is not the only channel,
 * though: the registered branch writes a reset token and queues a mail, and the
 * unknown branch used to return almost at once — a stopwatch enumerated accounts.
 * TASK-273 made the unknown branch burn an argon2 hash to even that out. This
 * script measures whether it actually does, against a real deployment, so
 * SF-AUTH-22 in docs/qa-recheck.md gets a number instead of an impression.
 *
 *   node scripts/qa/forgot-password-timing.mjs <api> <existing-email> <unknown-email> [N]
 *
 *   <api>             API origin, e.g. https://api.staging.mystore.ua
 *                     (a trailing /api is accepted too)
 *   <existing-email>  an ACTIVE account you own — see the side effects below
 *   <unknown-email>   an address with no account, e.g. nobody-<random>@example.com
 *   N                 samples per email (default 20)
 *
 * Options:
 *   --interval-ms <ms>  pause between requests (default 12500 — see "rate limit")
 *   --warmup <k>        requests per email sent first and discarded (default 1)
 *   --tolerance <f>     allowed relative difference of the medians (default 0.2)
 *   --spoof-xff         TEST STANDS ONLY — see "rate limit"
 *   --dry-run           print the plan and exit without sending anything
 *   --help
 *
 * Verdict: relative difference = |median(existing) − median(unknown)| divided by
 * the SMALLER median, so "within 20 %" is judged the strict way round.
 *
 * Exit codes: 0 — within tolerance; 1 — the two branches are distinguishable
 * (a finding: reopen TASK-273); 2 — the run could not be judged (bad arguments,
 * a 429, a non-200, a network error). A 2 is never a pass.
 *
 * ── Side effects — read before running ──────────────────────────────────────
 * Every request for <existing-email> is a REAL reset: it invalidates the previous
 * reset token and, with MAIL_ENABLED=true, sends a mail. N=20 means 20+ mails to
 * that inbox. Use a test account, never a customer's.
 *
 * ── Rate limit ──────────────────────────────────────────────────────────────
 * The endpoint is capped at 5 requests/min per IP (`@Throttle` in
 * auth.controller.ts) and fails CLOSED when the limiter is down (TASK-401). The
 * default pacing (12.5 s) stays under that, so N=20 takes about
 * (2·20 + 2 warmup) × 12.5 s ≈ 9 minutes. On a 429 the script reports it and
 * stops with exit 2: the samples after it would be timing the throttler, not the
 * branch under test.
 *
 * `--spoof-xff` sends a unique X-Forwarded-For per request and drops the pause.
 * The API trusts exactly one proxy hop (TASK-386), so this only has an effect
 * when the script talks to the API container DIRECTLY (bypassing Caddy, which
 * overwrites the header). It is for a staging box you control; it does nothing
 * useful against production, and it is not a way around the limit for anyone
 * else — if it DOES work through the public hostname, that is a finding in
 * itself (the proxy is not setting the header).
 *
 * ── Reading the result ──────────────────────────────────────────────────────
 * Network jitter is added to both sides equally, but it widens the spread: run
 * it from a machine close to the server (the VPS itself is best), and if the
 * verdict is borderline, run it again before concluding anything. Requests
 * alternate ABBA (existing, unknown, unknown, existing, …) so a drift over the
 * run — a warming cache, a busy neighbour — lands on both sides.
 *
 * Node 18+ (built-in fetch), no dependencies.
 */

const ENDPOINT_PATH = "/auth/password-reset/request";

const DEFAULTS = {
  samples: 20,
  intervalMs: 12_500,
  warmup: 1,
  tolerance: 0.2,
};

function usage() {
  // The header comment is the manual; print its usage block.
  return [
    "Usage: node scripts/qa/forgot-password-timing.mjs <api> <existing-email> <unknown-email> [N]",
    "       [--interval-ms <ms>] [--warmup <k>] [--tolerance <f>] [--spoof-xff] [--dry-run]",
    "",
    "Times POST <api>/api/auth/password-reset/request for a registered and an unknown",
    "email and compares the medians. Exit 0 = within tolerance (default 20 %),",
    "1 = distinguishable, 2 = could not be judged (429, errors, bad arguments).",
    "",
    "Every request for <existing-email> is a real reset (mail + token). Default pacing",
    "respects the 5/min limit: N=20 takes ~9 minutes. See the file header for details.",
  ].join("\n");
}

function fail(message) {
  console.error(`error: ${message}\n`);
  console.error(usage());
  process.exit(2);
}

function parseArgs(argv) {
  const positional = [];
  const options = { ...DEFAULTS, spoofXff: false, dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
        break;
      case "--interval-ms":
        options.intervalMs = Number(next());
        break;
      case "--warmup":
        options.warmup = Number(next());
        break;
      case "--tolerance":
        options.tolerance = Number(next());
        break;
      case "--spoof-xff":
        options.spoofXff = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith("--")) fail(`unknown option ${arg}`);
        positional.push(arg);
    }
  }

  const [api, existing, unknown, n] = positional;
  if (!api || !existing || !unknown)
    fail("three positional arguments are required");
  if (positional.length > 4) fail("too many arguments");

  let base;
  try {
    base = new URL(api);
  } catch {
    fail(`not a URL: ${api}`);
  }
  if (base.protocol !== "http:" && base.protocol !== "https:")
    fail(`not an http(s) URL: ${api}`);

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL.test(existing)) fail(`not an email: ${existing}`);
  if (!EMAIL.test(unknown)) fail(`not an email: ${unknown}`);
  if (existing.toLowerCase() === unknown.toLowerCase())
    fail("the two emails must differ");

  options.samples = n === undefined ? DEFAULTS.samples : Number(n);
  if (!Number.isInteger(options.samples) || options.samples < 3)
    fail("N must be an integer ≥ 3");
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 0)
    fail("--interval-ms must be ≥ 0");
  if (!Number.isInteger(options.warmup) || options.warmup < 0)
    fail("--warmup must be an integer ≥ 0");
  if (!(options.tolerance > 0 && options.tolerance < 1))
    fail("--tolerance must be between 0 and 1");
  // Spoofing only exists to lift the per-IP limit; pausing on top would be pointless.
  if (options.spoofXff && !argv.includes("--interval-ms"))
    options.intervalMs = 0;

  // Accept both `https://api.host` and `https://api.host/api`.
  const root = base.href.replace(/\/+$/, "");
  const url = `${root.endsWith("/api") ? root : `${root}/api`}${ENDPOINT_PATH}`;

  return { url, existing, unknown, ...options };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/** A per-request address from the TEST-NET-2 block (RFC 5737) — never routable. */
function fakeClientIp(index) {
  return `198.51.100.${(index % 250) + 1}`;
}

class AbortRun extends Error {}

async function timeOne(plan, email, index) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (plan.spoofXff) headers["X-Forwarded-For"] = fakeClientIp(index);

  const started = performance.now();
  let response;
  try {
    response = await fetch(plan.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    // The body is part of the answer: stop the clock only once it has arrived.
    await response.text();
  } catch (error) {
    throw new AbortRun(`request #${index + 1} failed: ${error.message}`);
  }
  const elapsed = performance.now() - started;

  if (response.status === 429) {
    throw new AbortRun(
      `request #${index + 1} was rate-limited (429). Raise --interval-ms (the limit is ` +
        "5/min per IP) or wait a minute; samples after a 429 time the throttler, not the reset.",
    );
  }
  if (response.status !== 200) {
    throw new AbortRun(
      `request #${index + 1} answered ${response.status}, expected 200`,
    );
  }
  return elapsed;
}

/** ABBA order: E U U E E U U E … so drift over the run lands on both sides. */
function buildSchedule(plan) {
  const schedule = [];
  for (let k = 0; k < plan.warmup; k++) {
    schedule.push(
      { kind: "existing", warmup: true },
      { kind: "unknown", warmup: true },
    );
  }
  for (let pair = 0; pair < plan.samples; pair++) {
    const order =
      pair % 2 === 0 ? ["existing", "unknown"] : ["unknown", "existing"];
    for (const kind of order) schedule.push({ kind, warmup: false });
  }
  return schedule;
}

function summarise(label, values) {
  const fmt = (ms) => `${ms.toFixed(1)} ms`;
  return (
    `${label.padEnd(9)} n=${String(values.length).padEnd(3)} median ${fmt(median(values)).padStart(10)}` +
    `  min ${fmt(Math.min(...values)).padStart(10)}  p90 ${fmt(percentile(values, 90)).padStart(10)}` +
    `  max ${fmt(Math.max(...values)).padStart(10)}`
  );
}

async function main() {
  const plan = parseArgs(process.argv.slice(2));
  const schedule = buildSchedule(plan);
  const etaSeconds = Math.round(
    ((schedule.length - 1) * plan.intervalMs) / 1000,
  );

  console.log(`Endpoint : POST ${plan.url}`);
  console.log(`Emails   : existing=${plan.existing}  unknown=${plan.unknown}`);
  console.log(
    `Plan     : ${plan.samples} samples each + ${plan.warmup} warmup each, ABBA order, ` +
      `${plan.intervalMs} ms apart (≈${etaSeconds} s)${plan.spoofXff ? ", X-Forwarded-For spoofed (test stand only)" : ""}`,
  );
  console.log(
    `Verdict  : pass when the medians differ by ≤ ${Math.round(plan.tolerance * 100)} %`,
  );

  if (plan.dryRun) {
    console.log("\n--dry-run: nothing sent.");
    return 0;
  }

  const results = { existing: [], unknown: [] };
  try {
    for (let i = 0; i < schedule.length; i++) {
      if (i > 0 && plan.intervalMs > 0) await sleep(plan.intervalMs);
      const step = schedule[i];
      const elapsed = await timeOne(plan, plan[step.kind], i);
      if (!step.warmup) results[step.kind].push(elapsed);
      process.stdout.write(
        `\r  ${i + 1}/${schedule.length} ${step.kind.padEnd(8)} ${elapsed.toFixed(1).padStart(8)} ms${step.warmup ? " (warmup)" : "         "}`,
      );
    }
  } catch (error) {
    if (!(error instanceof AbortRun)) throw error;
    console.error(`\n\nABORTED: ${error.message}`);
    console.error("Verdict: NOT JUDGED (exit 2).");
    return 2;
  }
  process.stdout.write("\n\n");

  const existingMedian = median(results.existing);
  const unknownMedian = median(results.unknown);
  const difference =
    Math.abs(existingMedian - unknownMedian) /
    Math.min(existingMedian, unknownMedian);

  console.log(summarise("existing", results.existing));
  console.log(summarise("unknown", results.unknown));
  console.log(
    `\nRelative difference of medians: ${(difference * 100).toFixed(1)} % ` +
      `(tolerance ${Math.round(plan.tolerance * 100)} %)`,
  );

  if (difference <= plan.tolerance) {
    console.log(
      "Verdict: PASS — the two branches are not distinguishable by median time.",
    );
    return 0;
  }
  const slower = existingMedian > unknownMedian ? "registered" : "unknown";
  console.log(
    `Verdict: FAIL — the ${slower} email is consistently slower; response time reveals ` +
      "whether an account exists. Re-run once to rule out noise, then reopen TASK-273.",
  );
  return 1;
}

// `exitCode`, not `exit()`: on Windows, exiting while fetch's keep-alive socket
// and a piped stderr are still flushing aborts the process with a native crash
// code instead of ours. Letting the loop drain costs a few seconds at most.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 2;
  },
);
