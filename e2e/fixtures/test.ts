import { test as base } from "@playwright/test";

/**
 * The suite's `test`, extended so every test gets its own rate-limit bucket
 * (TASK-463). Import from here, never from `@playwright/test` directly.
 *
 * ## The flake this removes, and how it was measured
 *
 * `admin-order-filters` failed in roughly two of three full runs, always the
 * same way: a login that succeeded, then a navigation that rendered the login
 * screen. Isolated `--project=admin`, or a run without `auth-flow`, was
 * reliably green — which pointed at shared suite state but named nothing.
 *
 * Turning the API's logs on (`LOG_LEVEL=debug`; `NODE_ENV=test` pins Pino to
 * `silent`, which is why earlier attempts saw nothing) made the mechanism
 * unambiguous. Login attempts against one long-lived API process, in order:
 *
 *     0.0s 200   1.0s 200   8.2s 200   14.6s 200   31.7s 200
 *    32.6s 429  45.3s 429  51.9s 429  64.4s 429  71.1s 429 …
 *   103.1s 200   ← the 60-second window rolled over
 *
 * `POST /api/auth/login` is capped at 5 per minute per IP
 * (`auth.controller.ts`), the counter lives in one process (the harness sets no
 * `REDIS_HOST`), and every browser context dials from `::1` — so the whole
 * suite shares ONE bucket. A full run performs four logins (`auth-flow` twice,
 * `admin-session` once per admin test), which fits under the cap exactly once.
 * A second run inside the same minute does not, and `reuseExistingServer` keeps
 * the counter alive between local runs. Hence "two failures in three runs":
 * run 1 passes, runs 2 and 3 exhaust the window. Not refresh-token reuse
 * detection, which was the other candidate — the log carries zero reuse events,
 * and the 429s land before any token work happens.
 *
 * ## Why a per-test forwarded address, rather than relaxing the cap
 *
 * 5/min per IP is a production rule worth keeping exactly as it is, and turning
 * it off for tests would mean the harness runs a configuration nobody ships.
 * What is unrealistic here is not the cap but the premise: real shoppers do not
 * share one address. `trust proxy` is on (1 hop, TASK-386), so an
 * `X-Forwarded-For` header is what `ClientIpThrottlerGuard.getTracker` counts —
 * verified directly against a running API, where seven logins from seven
 * addresses produced no 429 at all while five from one address exhausted it.
 *
 * Per WORKER-AND-TEST rather than per run or per project: each test logs in at
 * most once, so its own bucket never approaches five however many times the
 * suite is re-run. `testInfo.retry` is part of it on purpose — a CI retry
 * (`retries: 2`) re-runs the login, and without it the retries of one failing
 * test would stack in a single bucket, which is the same trap one level down.
 *
 * The addresses come from 198.51.100.0/24 (TEST-NET-2, RFC 5737) — reserved for
 * documentation and examples, so it can never collide with anything real.
 *
 * Rate limiting itself stays covered where it belongs: `rate-limit-client-ip`
 * and `rate-limit-fail-closed` are dedicated e2e specs that assert the guard's
 * behaviour directly.
 */

/** An address inside TEST-NET-2 for one (worker, test, retry) triple. */
function forwardedAddressFor(testId: string, retry: number): string {
  // FNV-1a over the test id, salted with the worker's pid. The pid is what makes
  // RE-RUNNING the suite safe: without it a test keeps one address for ever, so
  // running the suite six times inside a minute stacks six logins in that one
  // bucket and the cap trips again — measured, not assumed. A fresh worker
  // process means a fresh address, and in CI (`fullyParallel`, several workers)
  // it also stops two workers from sharing one bucket.
  let hash = 0x811c9dc5;
  for (const ch of `${process.pid}:${testId}:${retry}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 1..254: .0 and .255 are the network and broadcast addresses. A collision
  // would merely put two tests in one bucket, which still holds five logins.
  return `198.51.100.${(hash % 254) + 1}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({
      ...extraHTTPHeaders,
      "X-Forwarded-For": forwardedAddressFor(testInfo.testId, testInfo.retry),
    });
  },
});

export { expect, type Page } from "@playwright/test";
