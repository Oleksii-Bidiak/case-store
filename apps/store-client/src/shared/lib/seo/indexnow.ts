import * as Sentry from "@sentry/nextjs";
import { serverFetch } from "@/shared/api/server-fetch";
import { SITE_URL } from "@/shared/config";

/**
 * IndexNow (https://www.indexnow.org/) submission helper (TASK-282, plan 144).
 *
 * Bing and Seznam consume IndexNow pings for near-instant (re)indexing; Google
 * does not consume the protocol at all — and never breaks anything by receiving
 * it — so no per-engine branching is needed. Domain ownership is proven by the
 * plain-text key file served at `/indexnow.txt` (see `app/indexnow.txt/route.ts`).
 *
 * SITE_URL is imported directly (not passed by the caller) because IndexNow has
 * exactly one call site — the `/api/revalidate` route — mirroring how robots.ts
 * and llms.txt already import it (plan 144, helper section).
 */

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Own timeout budget, separate from the storefront default (TASK-327).
 *
 * This is the one call that leaves our network: TLS handshake + POST to a
 * third-party host over the public internet, so it gets its own knob rather
 * than inheriting the intra-cluster default tuned for the store-api hop.
 *
 * It is deliberately still a *hard* bound. The call runs inside `after()`, i.e.
 * after the admin's response has already been sent, so nothing user-visible
 * waits on it — but "nobody is waiting" is not "it may hang": an unanswered
 * socket pins a Node handle and a serverless/standalone invocation for as long
 * as it stays open. A ping that has not landed in 3 s has failed; the next admin
 * write will ping again anyway.
 */
const INDEXNOW_TIMEOUT_MS = 3000;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Reads `INDEXNOW_KEY` fresh on every call (not at module-load time) so tests
 * can mutate `process.env`. Returns `undefined` for unset / blank values.
 */
export function getIndexNowKey(): string | undefined {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key ? key : undefined;
}

/**
 * Pure payload builder. Returns `undefined` when no key is configured or when
 * `urls` is empty after filtering out empty strings and de-duplicating.
 */
export function buildIndexNowPayload(
  urls: string[],
): IndexNowPayload | undefined {
  const key = getIndexNowKey();
  if (!key) {
    return undefined;
  }

  const urlList = [...new Set(urls.filter((url) => url.length > 0))];
  if (urlList.length === 0) {
    return undefined;
  }

  return {
    host: new URL(SITE_URL).host,
    key,
    keyLocation: `${SITE_URL}/indexnow.txt`,
    urlList,
  };
}

/**
 * Fire-and-forget IndexNow submission. Never throws.
 *
 * No-op (no `fetch` at all) outside production — this gate is deliberate and
 * pinned by tests: without it every dev-machine save / CI run would spam
 * api.indexnow.org. Also a no-op when `INDEXNOW_KEY` is unset (the default),
 * mirroring the REVALIDATE_SECRET dev/prod gate in `app/api/revalidate/route.ts`.
 * Failures (non-2xx or a rejected fetch) are logged via `console.warn` and
 * swallowed — an indexing ping must never surface to the admin write path — but
 * they are also reported to Sentry: the caller runs inside `after()` and ignores
 * the result, so console output in the Node runtime is the only other trace, and
 * it never reaches the SDK on its own. A rejected fetch is a real error; a non-2xx
 * answer from IndexNow is a message (there is no Error object to capture).
 */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const payload = buildIndexNowPayload(urls);
  if (!payload) {
    return;
  }

  try {
    const res = await serverFetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      timeoutMs: INDEXNOW_TIMEOUT_MS,
    });
    if (!res.ok) {
      const message = `[indexnow] Submission rejected with status ${res.status} for ${payload.urlList.length} url(s)`;
      console.warn(message);
      Sentry.captureMessage(message, "warning");
    }
  } catch (err) {
    console.warn("[indexnow] Submission failed:", err);
    Sentry.captureException(err, { tags: { integration: "indexnow" } });
  }
}
