# Plan 144 — Robots AI-Crawler Stanza + IndexNow

> **Status:** ✅ Done (TASK-282 shipped; owner supplies the real `INDEXNOW_KEY`)
> **Phase:** Roadmap Етап 7 — SEO/GEO (BACKLOG.md; source `docs/handoff-seo.md` §SEO-6)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-282 `[SEO/L]`

## Overview

`docs/handoff-seo.md` §SEO-6 flags two gaps: `robots.ts` has no explicit stanza telling AI
crawlers (GPTBot, Google-Extended, PerplexityBot, ClaudeBot) they're welcome — a policy already
implied by the site shipping `llms.txt` (TASK-194) but never stated in `robots.txt` itself — and
the storefront never pings IndexNow (instant-index signal Bing/Seznam honor; Google ignores it,
which is harmless). The handoff marked IndexNow optional; **owner decision 2026-07-11: build it**
(not optional).

This plan touches `app/robots.ts` a second time after plan 143/TASK-278 (which added `/search` to
the existing `disallow` array) — per that plan's own sequencing note, this lands strictly after
and only _appends a new rule block_, it does not edit the `disallow` array TASK-278 added.

## Scope

### In Scope

- `app/robots.ts`: one new rule block for `GPTBot`/`Google-Extended`/`PerplexityBot`/`ClaudeBot`
  (`allow: "/"`), sharing the **same** service-path `disallow` list as the `*` rule (see Design
  Decision 1 — this is not optional, it's a correctness requirement of the robots.txt spec).
- IndexNow helper (`shared/lib/seo/indexnow.ts`): pure payload builder + `submitToIndexNow()`,
  no-op outside production or without a configured key.
- Key-file route `app/indexnow.txt/route.ts` serving the raw key as `text/plain` (404 when
  unconfigured).
- Wiring into `app/api/revalidate/route.ts`: after a revalidation request with non-empty `paths`,
  fire an IndexNow ping for those paths' absolute URLs via `after()` (post-response, non-blocking).
- `INDEXNOW_KEY` documented in `apps/store-client/.env.example` only — **not** the real `.env`
  (guarded by `guard-edits.js`; `.env.example` is explicitly exempt). The owner sets the real value.
- Unit tests: robots-config structure, IndexNow helper (payload + submit no-op/happy/error paths),
  integration test on the revalidate route (ping mocked).

### Out of Scope

- Wiring `Product`/`Category` into the backend `RevalidationNotifier`/`PublishablePort` pattern —
  **they aren't wired today** (verified: no `revalidate`/`RevalidationNotifier` reference anywhere
  under `apps/store-api/src/product` or `.../category`; only `blog`, `pages`, `banners`, `faq`,
  `seo-settings`, `site-contact` participate). That's a separate, unscoped task. Because this plan's
  IndexNow trigger keys off the `paths` array the revalidate route already receives (see Design
  Decision 3), wiring products/categories into publishing later needs **zero** changes here — their
  paths will simply start flowing through the same pipe.
- Any change to the `disallow` list TASK-278 (plan 143) just added — this plan only appends a new
  rule block.
- `merchant-feed.xml` (TASK-281), search-console verification (TASK-280) — separate tracks.
- IndexNow key rotation UX / admin form — env-var only per owner decision; no `SeoSettings` field.

## User Stories

1. As the store owner, I want AI assistants (ChatGPT, Claude, Perplexity, Gemini) to be explicitly
   welcomed to crawl the storefront, consistent with already publishing `llms.txt` for them.
2. As the store owner, I want Bing/Seznam to index new/changed pages within minutes of an admin
   publishing content, instead of waiting for their normal crawl cycle.
3. As a future maintainer, I want the IndexNow key to live only in env config (never hardcoded,
   never committed), with the whole feature degrading to a silent no-op when unconfigured so local
   dev and CI are unaffected.

## Technical Design

### Design Decision 1 — the AI-bot rule duplicates the `*` disallow list (not optional)

Per the robots.txt spec (and Google's own documentation), a crawler that matches a **named**
`User-agent` group uses **only** that group — it does **not** merge with or fall back to the `*`
group. If the new `GPTBot`/`Google-Extended`/`PerplexityBot`/`ClaudeBot` rule only set
`allow: "/"` without repeating the service-path `disallow` list, those bots would be explicitly
allowed onto `/cart`, `/checkout`, `/orders`, `/account`, `/search`, etc. — a real regression, not
just a missed opportunity. So: **duplicate** the disallow list. To avoid the two lists drifting
apart, extract it once as a local `SERVICE_DISALLOW` array and reference it from both rule objects
— a non-functional refactor of the existing array (same values, same order TASK-278 left them in).

The existing `noindexSite` early-return branch needs **no change**: it emits only a `*` rule, and a
crawler with no matching named group falls back to `*` by spec — so AI bots are correctly blocked
too whenever the owner flips the site-wide kill switch, with zero new code.

### Design Decision 2 — one grouped rule block, `userAgent` as an array

Next's `MetadataRoute.Robots` rule type accepts `userAgent: string | string[]`; an array renders as
multiple `User-agent:` lines sharing one `Allow`/`Disallow` set — valid robots.txt syntax and exactly
what's needed here (all four bots get identical treatment). One rule object, not four, keeps the
`SERVICE_DISALLOW` duplication to a single reference instead of four.

```ts
const SERVICE_DISALLOW = ["/cart", "/checkout", "/orders", "/account", "/login", "/register", "/search"];

rules: [
  { userAgent: "*", allow: "/", disallow: SERVICE_DISALLOW },
  {
    // AI-friendly policy (mirrors llms.txt, TASK-194): explicit allow for the
    // named AI crawlers, same service-path exclusions as everyone else.
    userAgent: ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot"],
    allow: "/",
    disallow: SERVICE_DISALLOW,
  },
],
```

### Design Decision 3 — IndexNow pings `paths`, not `tags`

`POST /api/revalidate`'s body already carries a `paths` array computed by the backend service that
triggered the revalidation (e.g. `blog.service.ts` → `paths: ['/blog', '/blog/${slug}']`,
`pages.service.ts` → `['/legal', '/legal/${slug}']`, `banners.service.ts` → `['/']`). This is
already the exact, precise set of affected public URLs — no tag-to-URL guessing table is needed.
`faq`/`seo-settings`/`site-contact` currently revalidate by **tag only** (no `paths`) — under this
design they simply don't trigger an IndexNow ping, which is the correct minimal behavior (a
settings/global change isn't "new/changed content" at one canonical URL; pinging every page that
happens to render the footer/FAQ on a `site-contact` write would be the over-engineering the task
explicitly says to avoid). This also means the helper needs **no knowledge of tag names at all** —
it's a pure `paths → absolute URLs → IndexNow` pipe, so wiring products/categories into publishing
later (Out of Scope above) requires no change here.

### Design Decision 4 — non-blocking via `after()`, not a bare unawaited promise

`apps/store-client` runs on Next 16.2.4, where `after()` (stable, exported from `next/server`) is
the correct primitive for "do this after the response is sent, don't block it, but don't let the
runtime tear the request down before it finishes either" — safer than a bare `void promise()` call,
which risks getting cut off on any deployment target that freezes/kills the function once the
response flushes (serverless-style runtimes). Confirmed present in this repo's `next/server` type
exports; no `experimental` config flag needed for this Next version.

### Design Decision 5 — SITE_URL / key stay server-only, feature no-ops by default

- `INDEXNOW_KEY` (no `NEXT_PUBLIC_` prefix — must never reach the client bundle) lives in
  `apps/store-client/.env.example` as a blank placeholder with a comment; the owner sets the real
  value in the untouched `.env`.
- `submitToIndexNow()` no-ops (resolves immediately, no `fetch`) when `NODE_ENV !== "production"`
  **or** the key is unset — mirrors the existing `REVALIDATE_SECRET` dev/prod gate already in
  `app/api/revalidate/route.ts`, so local dev/CI/staging-without-a-key never make an outbound call.
- `app/indexnow.txt/route.ts` returns 404 when unconfigured (no stale/empty key file exposed).
- Failures (non-2xx response or thrown fetch error) are caught and logged via `console.warn`
  (matching the existing `[scope] message` convention in `app/sitemap.ts`) — never thrown, never
  surfaces to the admin write or the revalidate response.
- Comment in the helper's header states plainly: Bing and Seznam consume IndexNow; Google does not
  (and never breaks anything by receiving it) — so no per-engine branching is needed.

### The helper — `shared/lib/seo/indexnow.ts`

```ts
export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** Reads INDEXNOW_KEY fresh on every call (not module-load time) so tests can mutate process.env. */
export function getIndexNowKey(): string | undefined;

/** Pure. Returns undefined when unconfigured or urls is empty after de-dupe/filter. */
export function buildIndexNowPayload(
  urls: string[],
): IndexNowPayload | undefined;

/** Side-effecting. No-op outside production or without a key; never throws. */
export function submitToIndexNow(urls: string[]): Promise<void>;
```

`buildIndexNowPayload` imports `SITE_URL` directly from `@/shared/config` (host = `new
URL(SITE_URL).host`, `keyLocation` = `${SITE_URL}/indexnow.txt`) rather than taking it as a
parameter — IndexNow has exactly one call site (the revalidate route), unlike `resolveSeo()`/
`buildListingMetadata()` which are reused across many page-level `generateMetadata`s and therefore
keep `SITE_URL` a call-site concern (plan 116/143 convention). `robots.ts` and `llms.txt/route.ts`
already import `SITE_URL` directly for the same single-call-site reason — this mirrors that, not
the multi-call-site helpers.

### Wiring — `app/api/revalidate/route.ts`

```ts
import { after, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { submitToIndexNow } from "@/shared/lib/seo/indexnow";
import { SITE_URL } from "@/shared/config";

// ...existing tag/path revalidation loop unchanged...

const urls = paths
  .filter((p): p is string => typeof p === "string" && p.length > 0)
  .map((p) => `${SITE_URL}${p}`);

if (urls.length > 0) {
  after(() => {
    void submitToIndexNow(urls);
  });
}

return NextResponse.json({
  data: { revalidated: true, tags, paths, now: Date.now() },
});
```

Placed after the existing 503/401 early returns (unconfigured secret / bad secret never reach this
point, matching current behavior — no IndexNow ping without a valid revalidate call).

## Tasks

### TASK-282-A: `robots.ts` — explicit AI-crawler stanza

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No (declarative config, not business logic) — still gets a unit test.
**Depends on:** — (TASK-278/plan 143 already merged on this branch)

**Acceptance Criteria:**

- [ ] `SERVICE_DISALLOW` constant extracted with the exact same 7 entries/order TASK-278 left
      (`/cart`, `/checkout`, `/orders`, `/account`, `/login`, `/register`, `/search`) — no value
      changed, only referenced from two places now
- [ ] New rule: `userAgent: ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot"]`,
      `allow: "/"`, `disallow: SERVICE_DISALLOW`
- [ ] `noindexSite` early-return branch unchanged (still emits only the `*` disallow-all rule; AI
      bots fall back to it by spec — verified by a test case, not just asserted in prose)
- [ ] Top-of-file doc comment updated to state the AI-friendly policy and the "named group ≠
      inherits from `*`, must duplicate disallow" rule, so it's not silently "cleaned up" later
- [ ] New `robots.test.ts` (co-located, `unit` Jest project): asserts the exact `rules` array shape
      for (a) normal mode — two rule blocks, AI rule's `disallow` deep-equals the `*` rule's
      `disallow`; (b) `noindexSite: true` — single `*` disallow-all rule, no AI-specific block, no
      `sitemap` key; (c) `fetchSeoSettings()` rejects/returns null → falls back to normal mode
      (mirrors the existing fallback comment in the file)
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client` (new test runs under `unit`)

**Files to create/modify:**

- `apps/store-client/src/app/robots.ts` — `SERVICE_DISALLOW` extraction + new rule block
- `apps/store-client/src/app/robots.test.ts` — new

---

### TASK-282-B: IndexNow helper + key-file route

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (not a critical module per AGENTS.md's TDD list) — full unit coverage still
required per this plan's test requirements.
**Depends on:** — (independent of TASK-282-A)

**Acceptance Criteria:**

- [ ] `getIndexNowKey()` reads `process.env.INDEXNOW_KEY` fresh per call, trims, returns
      `undefined` for empty/whitespace-only
- [ ] `buildIndexNowPayload(urls)` — pure; `undefined` when no key; `undefined` when `urls` is
      empty or all-empty-strings after filtering; de-dupes repeated URLs; `host`/`keyLocation`
      derived from `SITE_URL`
- [ ] `submitToIndexNow(urls)` — no-op (no `fetch` call) when `NODE_ENV !== "production"`; no-op
      when `buildIndexNowPayload` returns `undefined`; POSTs JSON to
      `https://api.indexnow.org/indexnow` with the built payload when configured; never throws —
      non-2xx and thrown/rejected `fetch` are both caught and logged via `console.warn`
      (`[indexnow] ...` prefix, matching `app/sitemap.ts`'s convention)
- [ ] `app/indexnow.txt/route.ts`: `GET` returns the raw key as `text/plain; charset=utf-8` with
      the same `Cache-Control: public, max-age=3600, s-maxage=86400` header `llms.txt` uses when
      configured; returns `404` (no body leak) when `INDEXNOW_KEY` is unset
- [ ] `shared/lib/seo/index.ts` barrel exports `getIndexNowKey`, `buildIndexNowPayload`,
      `submitToIndexNow`, `IndexNowPayload`
- [ ] `apps/store-client/.env.example`: new `INDEXNOW_KEY=` line with a comment covering — optional/
      production-only, Bing/Seznam honor it (Google ignores, harmless), no `NEXT_PUBLIC_` prefix
      (server-only, never in the client bundle), key format hint (`openssl rand -hex 16`)
- [ ] Real `.env` **not** touched by the implementer — owner sets the value manually (guard-edits.js
      already exempts `.env.example` from its edit block, confirmed in this plan's research)
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/shared/lib/seo/indexnow.ts` — new
- `apps/store-client/src/shared/lib/seo/indexnow.test.ts` — new
- `apps/store-client/src/shared/lib/seo/index.ts` — barrel export additions
- `apps/store-client/src/app/indexnow.txt/route.ts` — new
- `apps/store-client/.env.example` — `INDEXNOW_KEY` entry

**Test cases (indicative, not exhaustive — flesh out during implementation):**

| #   | Function               | Setup                                              | Expected                                     |
| --- | ---------------------- | -------------------------------------------------- | -------------------------------------------- |
| 1   | `getIndexNowKey`       | `INDEXNOW_KEY` unset                               | `undefined`                                  |
| 2   | `getIndexNowKey`       | `INDEXNOW_KEY="  "`                                | `undefined`                                  |
| 3   | `getIndexNowKey`       | `INDEXNOW_KEY="abc123"`                            | `"abc123"`                                   |
| 4   | `buildIndexNowPayload` | no key                                             | `undefined`                                  |
| 5   | `buildIndexNowPayload` | key set, `urls: []`                                | `undefined`                                  |
| 6   | `buildIndexNowPayload` | key set, `urls: ["http://x/a", "http://x/a"]`      | `urlList: ["http://x/a"]` (deduped)          |
| 7   | `buildIndexNowPayload` | key set, one url                                   | `host`/`keyLocation` derived from `SITE_URL` |
| 8   | `submitToIndexNow`     | `NODE_ENV="test"` (default), key set, urls present | `fetch` never called                         |
| 9   | `submitToIndexNow`     | `NODE_ENV="production"`, no key                    | `fetch` never called                         |
| 10  | `submitToIndexNow`     | `NODE_ENV="production"`, key set, urls present     | `fetch` called once, POST, correct body      |
| 11  | `submitToIndexNow`     | `fetch` mocked to reject                           | resolves (no throw), `console.warn` called   |
| 12  | `submitToIndexNow`     | `fetch` mocked → `{ ok: false, status: 422 }`      | resolves (no throw), `console.warn` called   |
| 13  | `indexnow.txt` route   | no key                                             | `404`                                        |
| 14  | `indexnow.txt` route   | key set                                            | `200`, body === key, `text/plain`            |

---

### TASK-282-C: Wire IndexNow into the revalidate route

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-282-B

**Acceptance Criteria:**

- [ ] `app/api/revalidate/route.ts`: after the existing `revalidateTag`/`revalidatePath` loop, when
      the request's `paths` array has ≥1 non-empty string entry, schedules
      `submitToIndexNow(absoluteUrls)` via `after()` — never awaited inline, never delays the
      `NextResponse.json` return
      that early-return path never reaches the `after()` call
- [ ] Tags-only requests (`paths: []`, e.g. today's `faq`/`seo-settings`/`site-contact` writes) do
      **not** trigger `after()`/`submitToIndexNow` at all
- [ ] New `route.test.ts` (first test file for this route) mocking `next/cache`
      (`revalidateTag`/`revalidatePath` as jest fns — calling the real ones outside a request scope
      is unsafe/undefined in a plain Jest node environment) and `next/server`'s `after` (invoke the
      callback synchronously via `jest.requireActual` passthrough for `NextResponse`), plus
      `@/shared/lib/seo/indexnow`'s `submitToIndexNow` mocked:
  - [ ] Existing 503 (no secret, prod), 401 (bad secret), 200 (no secret, dev) behaviors still pass
        unchanged (regression coverage — this route had zero tests before this task)
  - [ ] Valid request with `paths: ["/blog", "/blog/x"]` → `submitToIndexNow` called once with
        `[`${SITE_URL}/blog`, `${SITE_URL}/blog/x`]`
  - [ ] Valid request with `tags: ["faq"]`, no `paths` → `submitToIndexNow` never called
  - [ ] Valid request with empty body (`{}`) → `submitToIndexNow` never called, response still 200
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/app/api/revalidate/route.ts` — `after()` + `submitToIndexNow` wiring
- `apps/store-client/src/app/api/revalidate/route.test.ts` — new

## Migration Steps

1. TASK-282-A (robots stanza) and TASK-282-B (IndexNow helper + key route) — independent, may be
   done in either order or in parallel (no shared files).
2. TASK-282-C — after TASK-282-B, wires the helper into the revalidate route.
3. Manual smoke after merge (not a task — owner/deploy-time check, no `INDEXNOW_KEY` needed to
   verify the no-op path): `curl localhost:3000/robots.txt` shows both rule blocks with matching
   disallow lists; `curl -i localhost:3000/indexnow.txt` → 404 with no key set.
4. Real verification of an actual IndexNow submission (200 from `api.indexnow.org`) needs a real key
   in a deployed (production `NODE_ENV`) environment — owner sets `INDEXNOW_KEY`, not part of this
   plan's automated acceptance criteria (mirrors how `REVALIDATE_SECRET`/`STOREFRONT_REVALIDATE_URL`
   live-wiring is already a deploy-time concern, not a unit-test one).

## Risks & Mitigations

| Risk                                                                                                                                        | Mitigation                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI-bot rule forgets to duplicate `disallow` → accidentally opens `/cart`/`/checkout`/etc. to those crawlers                                 | Design Decision 1 makes this explicit + test asserts the two `disallow` arrays deep-equal, not just "AI rule exists"                                                     |
| `after()` callback throwing crashes the request in some runtime                                                                             | `submitToIndexNow` never throws (internal try/catch) — `after()` only ever receives a promise that always resolves                                                       |
| A future dev "simplifies" `submitToIndexNow` by removing the `NODE_ENV` gate, causing dev machines to spam `api.indexnow.org` on every save | Comment on the gate + a dedicated test (case 8/9 above) pins the no-op behavior                                                                                          |
| IndexNow requires all submitted URLs share the `host` in the payload; a future caller passes a foreign-host URL                             | Not runtime-validated (out of scope — the only call site builds URLs via `SITE_URL` prefix, guaranteeing same host); noted here in case a second call site is ever added |
| `.env.example` edit gets blocked by the same hook as real `.env` files                                                                      | Verified in this plan's research: `guard-edits.js`'s regex explicitly excludes `.env.example` — no risk                                                                  |

## Notes

- IndexNow protocol reference: `POST https://api.indexnow.org/indexnow`, JSON body
  `{ host, key, keyLocation, urlList }`; a plain-text key file at `keyLocation` (any path — doesn't
  have to be `/{key}.txt`) proves domain ownership. Google does not consume IndexNow at all (Bing
  confirmed, Seznam confirmed, Yandex confirmed) — this is expected and not treated as a failure
  anywhere in this plan.
- `Product`/`Category` are not on the `RevalidationNotifier` pipe today (verified by search — see
  Out of Scope). If/when a future task wires them in with a `paths` array, IndexNow pings for them
  automatically with no change to this plan's code, by design (Decision 3).
