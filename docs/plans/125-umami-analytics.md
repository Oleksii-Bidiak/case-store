# Plan 125 — Umami Self-Hosted Analytics

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 2** (Деплой (staging рано) + аналітика паралельно)
> **Origin:** `docs/handoff-2026-07-07.md` Блок E «Аналітика відвідувань і воронка», lines
> 208–240 (TASK-261 detail lines 215–227)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-261
> **Depends on:** — (independent of TASK-270/271, but shares a two-env-var naming contract with
> them — see Dependencies & Sequencing)

## Overview

The admin sales dashboard (TASK-249, plan 120) already answers "what did we sell and to whom" —
revenue, AOV, repeat-buyer rate, last orders. Nothing in the product today answers the other half
of "is the business working": how many people actually visit the storefront, which pages they
land on, and — critically — where they drop off between seeing a product and completing a
purchase. Block E is prioritized by the owner alongside CRM and CI/CD (their explicit ①-priority
group from the 2026-07-07 handoff) precisely because traffic/behavior visibility is the missing
half of that picture, and staging (plan 123/124) is being stood up in the same wave so the owner
can start watching real numbers early rather than after the whole Хвиля 2 program lands.

The owner has already approved the vendor decision (handoff, Block E header): **self-hosted
Umami** — one extra Docker container, free, has built-in funnels and a UA-capable UI, and
collects no personally-identifiable data (no fingerprinting, no cross-site cookies), so it needs
**no cookie-consent banner** — the parked TASK-090 stays parked. GA4/Meta Pixel remain parked
(TASK-050/090) until the store starts paid advertising, at which point their consent-banner
requirement becomes relevant again.

This plan (TASK-261) is the "wire it up" task: a dev Postgres-backed Umami container, a script tag

- six e-commerce event calls on the storefront, one CSP touch-point on `store-api`, and the initial
  funnel configuration. Two adjacent handoff tasks are explicitly **not** this plan's job: TASK-262
  (mirroring 2–3 Umami numbers into the admin dashboard — parked "phase 2, only if the owner asks
  after a month of using Umami's own UI") and TASK-263 (the full plain-language "what is a
  visit/conversion/funnel" admin-guide chapter). See Scope and Design Decision 4 for the exact
  boundary with TASK-263.

## Scope

### In Scope

- `docker-compose.yml` (dev): a new `umami` service — the Postgres-backed image variant, using a
  separate `umami` database inside the **existing** shared `postgres` container (not a dedicated
  Postgres of its own).
- Storefront tracking: a `next/script` tag (`strategy="afterInteractive"`, env-gated, effectively
  off in local dev since dev leaves the env vars empty), a small vendor-agnostic
  `shared/lib/analytics.ts` facade, and the six e-commerce event call sites the handoff names:
  `view_product`, `add_to_cart`, `begin_checkout`, `purchase` (with amount), `search` (with the
  query), `newsletter_subscribe`.
- `store-api`: widen the **production** Helmet CSP (`security.config.ts` — the TASK-194 config) so
  it can optionally allow an Umami origin, via a new optional env var.
- `.env.example` updates (root, `apps/store-client`, `apps/store-api`) documenting every new key.
- Configuring the `view_product → add_to_cart → begin_checkout → purchase` funnel in the live
  Umami UI, plus a narrow "how to configure the funnel" runbook stub.

### Out of Scope

- Any admin-dashboard traffic widget or "open Umami" link card — TASK-262, explicitly a later,
  optional phase-2 item ("НЕ будувати власні графіки трафіку — це дублювання чужого продукту").
- The full "Аналітика" admin-guide chapter explaining visits/unique/conversion/funnel concepts and
  why Umami's numbers won't match the dashboard's order counts (ad blockers, bots) — TASK-263,
  separate Wave-3 plan. This plan's own admin-guide edit is a narrow mechanical stub only (Design
  Decision 4).
- `docker-compose.prod.yml`'s `umami` service, any Dockerfile, or the Caddy reverse-proxy — all
  owned by TASK-270/plan 123. This plan only agrees on the **names** of two env vars with that
  plan so the storefront's script tag and the prod compose file's Umami service reference the
  identical contract; no file is shared.
- GA4 / Meta Pixel wiring (parked TASK-050/090) and the cookie-consent banner (parked TASK-090 —
  genuinely unnecessary here since Umami collects no personal data).
- Any Prisma schema change or new `store-api` endpoint/DTO — Umami owns its own schema in its own
  database, entirely decoupled from this repo's Prisma models. **No Orval regen** — the Swagger
  contract is untouched by this plan.

## User Stories

1. As the store owner, I want to see how many people visit my storefront each day and which pages
   they land on, so I know whether my SEO/content work (Етап 5) is bringing any traffic at all.
2. As the store owner, I want to see where visitors drop off between viewing a product, adding it
   to cart, starting checkout, and completing an order, so I know which step of my own funnel is
   losing sales — not just how many orders I ended up with.
3. As the store owner, I want this without a cookie-consent banner and without sending my
   customers' behavior to Google or Meta, so I stay simple and privacy-friendly before I've even
   started paid advertising.

## Technical Design

### Data Model

No Prisma schema change. Umami manages its own schema inside its own `umami` Postgres database via
its own internal startup migrations — fully decoupled from this repo's `schema.prisma`.

### Design Decision 1 — dev-compose Umami service (Postgres-image variant, shared Postgres)

- **Image:** `docker.umami.is/umami-software/umami:postgresql-latest` — Umami's official
  pre-built image that expects an external `DATABASE_URL` (as opposed to the bundled
  all-in-one compose Umami also publishes, which ships its own dedicated Postgres — not used here
  since the handoff explicitly asks for "окрема БД у **наявному** Postgres").
- **Env:** `DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/umami`,
  `APP_SECRET=${UMAMI_APP_SECRET:?UMAMI_APP_SECRET must be set}` (new `.env.example` root key,
  same "generate with `crypto.randomBytes`" convention already used for `JWT_SECRET`),
  `DISABLE_TELEMETRY=1` (Umami's own opt-out of _its_ anonymous usage telemetry — unrelated to
  what Umami itself collects about our visitors).
- **Port:** container listens on `3000` internally; mapped to host `3003:3000` locally (3000/3001/
  3002 are already store-client/store-api/store-admin).
- `depends_on: postgres: condition: service_healthy`.
- **Second-database bootstrap gotcha:** the official Postgres image only auto-creates the database
  named by `POSTGRES_DB` on a **brand-new, empty** data volume (via
  `docker-entrypoint-initdb.d`). Most contributors already have a populated `store_postgres`
  volume, so a plain init script only helps first-time setups or anyone who
  `docker compose down -v`s. This task therefore ships **both**: a new
  `docker/postgres-init/00-create-umami-db.sql` (`CREATE DATABASE umami;`, mounted read-only into
  `postgres`'s `docker-entrypoint-initdb.d`, auto-runs on a fresh volume) **and** a one-line
  documented manual fallback for existing volumes
  (`docker exec store_postgres psql -U postgres -c "CREATE DATABASE umami"`), called out as a
  compose comment directly above the `umami` service.

### Design Decision 2 — the facade is a thin, vendor-agnostic, fail-silent wrapper

`apps/store-client/src/shared/lib/analytics.ts` (new):

```ts
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

export type AnalyticsEvent =
  | "view_product"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "newsletter_subscribe";

export function trackEvent(
  event: AnalyticsEvent,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  window.umami?.track(event, data);
}
```

- `UMAMI_SRC` / `UMAMI_WEBSITE_ID` are new constants in `shared/config/site.ts`
  (`process.env.NEXT_PUBLIC_UMAMI_SRC ?? ""` / `process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? ""`),
  mirroring the existing `SITE_URL`/`CURRENCY` pattern in that same file, and re-exported as
  `UMAMI_ENABLED = Boolean(UMAMI_SRC && UMAMI_WEBSITE_ID)`. **`next.config.ts`'s `env` block is
  deliberately not touched** — Next.js inlines any `NEXT_PUBLIC_`-prefixed var referenced via
  `process.env.NEXT_PUBLIC_X` at build time regardless of that config block (the block is a
  pre-existing, redundant-but-harmless documentation convention in this repo's two `next.config.ts`
  files, not a requirement). This also means this plan never has to touch `next.config.ts`, which
  stays entirely on TASK-270's side of the split.
- `window.umami` ends up `undefined` in three independent situations, all degrading to a silent
  no-op via the single `?.` guard: (a) the env vars are unset so the `<Script>` never renders, (b)
  the script tag rendered but hasn't finished loading yet (a race at first interaction), (c) an
  ad-blocker strips the request. No call site needs its own env check — this is exactly the
  handoff's "сторінка вітрини без Umami-env працює без помилок" bar.
- `UMAMI_ENABLED` is exported separately because the `<Script>` tag itself needs an explicit
  render gate (an empty `src` is invalid); the six `trackEvent()` call sites don't re-check it.

### Design Decision 3 — Script placement and loading strategy

`<Script src={UMAMI_SRC} data-website-id={UMAMI_WEBSITE_ID} strategy="afterInteractive" />` is
added directly inside `app/layout.tsx`'s `<body>` (after `<Footer />`), gated on `UMAMI_ENABLED`.
Confirmed against Next.js's own Script Component reference: `afterInteractive` (the default
strategy, and the one the docs explicitly recommend for "Analytics" scripts) works from a plain
`async function RootLayout` **Server Component** with no `"use client"` — only the `onLoad`/
`onReady`/`onError` props require a Client Component, none of which this plan uses.

### Design Decision 4 — funnel-configuration scope boundary with TASK-263

The handoff's TASK-261 bullet includes "configure the funnel in Umami (steps described in
admin-guide)". TASK-263 (separate, later Wave-3 plan) owns the _full_ "Аналітика" admin-guide
chapter — what a visit/unique/conversion/funnel even means, and why Umami's numbers won't match
the dashboard's order counts (ad blockers, bots). To avoid TASK-263 finding no chapter to extend,
or this plan writing a chapter outside its own remit, TASK-261-E adds only a **narrow, mechanical**
`## Аналітика` → `### Налаштування воронки` stub — the concrete Umami-UI click-path plus the
four-event mapping — with an inline `<!-- TASK-263 expands this section with plain-language
explanations for the owner -->` marker so the follow-up plan has a clear, non-colliding anchor
(the same boundary-drawing device plan 122 used for its own TASK-269 overlap).

### API Contract

No changes. Umami is a fully self-contained service with its own HTTP surface, never proxied
through `store-api`; no new endpoint, DTO, or Orval regen anywhere. The CSP directive widening
below is an HTTP response **header** value, not an API contract change.

### `store-api` CSP change (Design Decision 5 — with an honest caveat)

`buildHelmetOptions(isProduction: boolean, umamiOrigin?: string)` gains a second, optional
parameter. When `isProduction && umamiOrigin`, both the `scriptSrc` and `connectSrc` production
directives gain that origin (Umami's tracker script both loads _from_ that origin and beacons
event payloads back _to_ it — both directives are needed, not just `scriptSrc`). `main.ts`'s
existing call becomes `buildHelmetOptions(isProduction, configService.get<string>('UMAMI_ORIGIN'))`.
New optional `UMAMI_ORIGIN` in `apps/store-api/.env.example` documented as "the public origin
serving self-hosted Umami, e.g. `https://analytics.mystore.ua` — matches the _origin_ portion of
the storefront's `NEXT_PUBLIC_UMAMI_SRC`".

**Caveat, documented here so it is not "discovered" as a bug later:** `store-api`'s Helmet CSP
header is only ever sent on responses `store-api` itself serves — the dev-only Swagger UI,
`/health`, any future API-served HTML. It is **not** inherited by `store-client`'s own pages,
which today send **no** CSP header of their own (confirmed: no `Content-Security-Policy`/`helmet`
usage exists anywhere under `apps/store-client` or `apps/store-admin`). Widening `store-api`'s CSP
therefore does **not**, by itself, change whether a browser blocks the Umami `<Script>` on the
storefront. The handoff's instruction to "check the TASK-194 config" is followed literally (it is
the only Helmet/CSP configuration in the codebase); the change is genuinely harmless
defense-in-depth on the surfaces `store-api` itself serves, and keeps a ready-made origin value
available for a _future_ `store-client` CSP header if one is ever added — but it is not load-bearing
for this plan's own "events visible in Umami" acceptance bar. Restated in Risks.

### Frontend (Next.js — FSD) — the six event call sites

No new components. Each is a small addition to an existing client component:

| Event                  | Component                                                        | Trigger                                                                                                                                    | Payload                                                      |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `view_product`         | `widgets/product-detail/ui/product-detail-view.tsx`              | New `useEffect` keyed on `viewed?.id`, same shape as the existing "recently viewed" effect a few lines above it                            | `{ slug: viewed.slug }`                                      |
| `add_to_cart`          | `features/add-to-cart/ui/add-to-cart-button.tsx`                 | Existing `useAddToCart({ mutation: { onSuccess } } )`                                                                                      | `{ productId, quantity }`                                    |
| `begin_checkout`       | `widgets/checkout/ui/checkout-view.tsx`                          | New `useEffect`, fires once (`useRef` guard) after the existing auth/empty-cart redirect guards pass and cart data has loaded with ≥1 item | `{ itemCount: data.items.length }`                           |
| `purchase`             | `widgets/order-confirmation/ui/order-confirmation-view.tsx`      | New `useEffect`, fires once (`useRef` guard keyed on `order.id`) after `order` first loads successfully                                    | `{ orderId: order.id, amount: order.total }`                 |
| `search`               | `widgets/search-results/ui/search-results-view.tsx`              | New `useEffect` keyed on the non-empty `query` prop                                                                                        | `{ query }`                                                  |
| `newsletter_subscribe` | `features/newsletter-subscribe/ui/newsletter-subscribe-form.tsx` | Existing `useNewsletterControllerSubscribe()`'s `onSuccess`                                                                                | `{ source }` (the form's existing optional attribution prop) |

Every `useEffect`-based call reuses the exact same one-time-per-mount-or-key-change ref-guard shape
already established by `ProductDetailView`'s "recently viewed" effect — no new shared hook is
introduced; six small, easy-to-review 3–4 line effects beat a new cross-cutting abstraction for six
call sites.

## Tasks

### TASK-261-A: Dev-compose Umami service + second-database bootstrap

**Type:** chore
**Scope:** shared (root `docker-compose.yml`)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `docker-compose.yml` gains a `umami` service exactly per Design Decision 1 (image, env,
      `3003:3000` port mapping, `depends_on: postgres: condition: service_healthy`)
- [ ] `docker/postgres-init/00-create-umami-db.sql` (new) contains `CREATE DATABASE umami;`,
      mounted read-only into the `postgres` service's `docker-entrypoint-initdb.d`
- [ ] Root `.env.example` gains `UMAMI_APP_SECRET=` with the same generation-hint comment style as
      `JWT_SECRET`
- [ ] The existing-volume manual fallback (`docker exec store_postgres psql -U postgres -c "CREATE
  DATABASE umami"`) is documented as a compose comment directly above the `umami` service
- [ ] Local-verifiable: `docker compose config` validates the new service's YAML with no errors;
      on a **fresh** volume (`docker compose down -v` first) `docker compose up -d postgres
  umami` boots cleanly and `docker compose logs umami` shows no database-connection error
- [ ] Manual-qa (append to `docs/manual-qa-pending.md`): the documented fallback command also
      succeeds against an **existing**, already-initialized dev Postgres volume

**Files to create/modify:**

- `docker-compose.yml` — new `umami` service
- `docker/postgres-init/00-create-umami-db.sql` — new
- `.env.example` (root) — `UMAMI_APP_SECRET`
- `docs/manual-qa-pending.md` — one new manual entry

---

### TASK-261-B: Analytics facade + env constants + Script tag

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — a thin, well-isolated facade; still unit-tested per the criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `shared/config/site.ts` gains `UMAMI_SRC` / `UMAMI_WEBSITE_ID` / `UMAMI_ENABLED` per Design
      Decision 2
- [ ] `shared/lib/analytics.ts` (new) exports `AnalyticsEvent`, `trackEvent()`, and the
      `Window.umami` ambient type augmentation, exactly per Design Decision 2; registered in
      `shared/lib/index.ts`'s barrel (safe to re-export — no `"use client"`, no React import,
      unlike the documented `use-debounced-callback` exception in that same barrel)
- [ ] `shared/lib/analytics.test.ts` (new): `trackEvent()` does not throw when `window.umami` is
      undefined; calls `window.umami.track(event, data)` with the right arguments when a stub is
      present; `UMAMI_ENABLED` reflects both env vars present/absent
- [ ] `app/layout.tsx`: `<Script>` added per Design Decision 3, gated on `UMAMI_ENABLED`, placed
      after `<Footer />`
- [ ] `apps/store-client/.env.example` gains `NEXT_PUBLIC_UMAMI_SRC=` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID=`
      with a comment noting both must be set together or the facade stays a no-op
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client (confirms the gated `<Script>`
      doesn't break SSR/build with empty env, the default local-dev state)
- [ ] Tests pass: `npm run test -w apps/store-client -- analytics`

**Files to create/modify:**

- `apps/store-client/src/shared/config/site.ts` — new constants
- `apps/store-client/src/shared/lib/analytics.ts` — new
- `apps/store-client/src/shared/lib/analytics.test.ts` — new
- `apps/store-client/src/shared/lib/index.ts` — barrel export
- `apps/store-client/src/app/layout.tsx` — `<Script>` tag
- `apps/store-client/.env.example` — new keys

---

### TASK-261-C: Wire the six e-commerce events

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-261-B

**Acceptance Criteria:**

- [ ] All six call sites wired exactly per the Technical Design table (component, trigger, payload)
- [ ] Each of the six touched components' existing test files gains one assertion (mocking
      `window.umami.track`, or asserting the facade export was called — whichever keeps the mock
      closest to the component under test per existing conventions in that file) confirming the
      event fires with the correct name once per the guarded key, and does **not** re-fire on an
      unrelated re-render
- [ ] No existing assertion in any of the six touched test files regresses
- [ ] `begin_checkout`/`purchase`/`search` effects do not fire before their respective guard
      conditions are met (unauthenticated/empty-cart/loading states must not emit an event)
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client` (full suite green; per the store-client
      parallel-flake note, run `--runInBand` if the full suite times out under parallel load)

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` (+ its test)
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.tsx` (+ its test)
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` (+ its test)
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx` (+ its test)
- `apps/store-client/src/widgets/search-results/ui/search-results-view.tsx` (+ its test)
- `apps/store-client/src/features/newsletter-subscribe/ui/newsletter-subscribe-form.tsx` (+ its test)

---

### TASK-261-D: `store-api` CSP — optional Umami origin allowance

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** — (independent of B/C)

**Acceptance Criteria:**

- [ ] `buildHelmetOptions(isProduction, umamiOrigin?)` implemented exactly per Design Decision 5;
      `main.ts`'s existing call site updated to pass `configService.get<string>('UMAMI_ORIGIN')`
- [ ] `security.config.spec.ts`: all 5 existing assertions pass unmodified with no second argument
      (fully backward-compatible default); new case asserts `scriptSrc`/`connectSrc` include the
      origin only when `isProduction && umamiOrigin` are both truthy, and stay exactly `["'self'"]`
      when `umamiOrigin` is omitted even in production
- [ ] `apps/store-api/.env.example` gains `UMAMI_ORIGIN=` with the caveat comment from Design
      Decision 5 (this header does not gate the storefront itself — kept for defense-in-depth on
      surfaces `store-api` serves directly, and future-proofing)
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api -- security.config`

**Files to create/modify:**

- `apps/store-api/src/config/security.config.ts`
- `apps/store-api/src/config/security.config.spec.ts`
- `apps/store-api/src/main.ts`
- `apps/store-api/.env.example`

---

### TASK-261-E: Funnel configuration + admin-guide stub

**Type:** docs
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-261-A, TASK-261-B, TASK-261-C (needs real events flowing on a running stand
to configure and verify a real funnel)

**Acceptance Criteria (all manual-qa — needs a running stand with Umami + live events):**

- [ ] In the live Umami UI: **Reports → add Funnel** → four ordered **Event**-type steps
      (`view_product` → `add_to_cart` → `begin_checkout` → `purchase`), saved
- [ ] `docs/admin-guide.md` gains the stub `## Аналітика` → `### Налаштування воронки`
      subsection (Design Decision 4): the exact Umami-UI click-path plus the four-event mapping,
      with the `<!-- TASK-263 expands... -->` marker comment
- [ ] `docs/manual-qa-pending.md` gains one new numbered "Хвиля 2 — Umami" entry recording: events
      visible in Umami's live event log after manually walking a PDP → add-to-cart → checkout →
      order-confirmation flow once; the funnel report shows a non-zero count at step 1

**Files to create/modify:**

- `docs/admin-guide.md`
- `docs/manual-qa-pending.md`

## Dependencies & Sequencing

- **Internal:** TASK-261-A and TASK-261-B/D can start in parallel. TASK-261-C depends on B.
  TASK-261-E depends on A+B+C all being live on a running stand (events must actually flow before
  a funnel can be configured or verified). Suggested order: A, B, D in parallel → C → E last.
- **File-ownership contract with TASK-270 (plan 123) and TASK-271 (plan 124), all three running in
  parallel worktrees:** this plan touches `docker-compose.yml` (**dev** only — TASK-270 owns the
  separate `docker-compose.prod.yml`), `apps/store-client/src/**` (TASK-270 only touches
  `apps/store-client/next.config.ts`/`Dockerfile`/`.dockerignore` — zero file overlap),
  `apps/store-api/src/config/security.config.ts` + its own `.env.example` (TASK-270 never touches
  `store-api` source, only the new, separate `.env.production.example`), and root `.env.example`
  (**dev** — TASK-270 owns the separate `.env.production.example`). **No file is edited by more
  than one of these three plans.** The only shared surface is a **naming contract**: the two env
  vars `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (this plan defines and consumes
  them; TASK-270's prod compose merely references the same names as build-args, never creating the
  storefront tracking itself) and the fact that `docker-compose.prod.yml` will define its own
  `umami` service mirroring this plan's dev one.
- **Feeds** TASK-262 (admin dashboard traffic link, parked) and TASK-263 (full admin-guide
  analytics chapter) — neither is a hard dependency of this plan; both are natural next steps once
  the owner has used Umami for a while.

## Risks & Mitigations

| Risk                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store-api`'s widened CSP does not actually gate the storefront (see Design Decision 5 caveat) — could be mistaken for "done, Umami is now allowed" when it isn't load-bearing | Documented explicitly in the plan and in the `.env.example` comment; the real gate is simply "the `<Script>` tag renders and the browser has no CSP restricting it," which is already true today since `store-client` sends no CSP header                                                                                                                                                      |
| Umami's own container needs to apply its internal startup migrations on first boot, which can take a few seconds longer than a typical health-checked service                  | `depends_on: condition: service_healthy` on `postgres` only (not a hard requirement on Umami's own readiness); the dev compose has no other service depending on `umami` being ready, so a slow first boot is harmless                                                                                                                                                                         |
| Second-database bootstrap silently does nothing for contributors with an existing, already-initialized dev Postgres volume                                                     | Explicit compose comment + documented one-line fallback command + a manual-qa entry that exercises exactly that path                                                                                                                                                                                                                                                                           |
| An ad-blocker or browser privacy extension strips the Umami script/requests during the manual QA walk-through, producing a false "no events" reading                           | The manual QA step notes to disable ad-blockers for that one verification pass; Umami's own numbers being an undercount vs. real traffic (ad blockers, bots) is an accepted, documented limitation carried into TASK-263's future admin-guide chapter                                                                                                                                          |
| Duplicate event firing on re-render (e.g. `purchase` firing twice if `OrderConfirmationView` re-renders after the initial load) would inflate funnel counts                    | Every effect-based call site uses a `useRef` one-time guard, mirrored from the existing `ProductDetailView` "recently viewed" pattern; pinned by the RTL assertions in TASK-261-C requiring "does not re-fire on an unrelated re-render"                                                                                                                                                       |
| `docker.umami.is/umami-software/umami:postgresql-latest` is a floating tag — a future upstream release could change required env vars or break compatibility without warning   | Accepted for dev/local use (matches this repo's existing floating-tag convention for `postgres:17-alpine`/`redis:7-alpine`/`getmeili/meilisearch:v1.10` is actually pinned by minor version — Umami has no realistic pinned-minor equivalent published; TASK-270's prod compose can choose to pin a specific digest if the owner wants stricter reproducibility, a decision left to that plan) |

## Notes

- Umami requires no personal-data collection to compute its metrics (no cross-site cookies, no
  fingerprinting) — this is the specific product property that lets TASK-090 (cookie-consent
  banner) stay parked; if a future GA4/Meta Pixel integration is ever activated, the consent-banner
  requirement returns and needs its own plan.
- The six event names (`view_product`, `add_to_cart`, `begin_checkout`, `purchase`, `search`,
  `newsletter_subscribe`) are the literal event names sent to Umami's `track()` call — they double
  as the funnel step names configured in TASK-261-E, so no separate mapping table needs to be
  maintained outside this plan and the admin-guide stub.
- `PROMO_BANNER`/`ANNOUNCEMENT_BAR` banner click-through tracking, wishlist events, and any event
  beyond the six named in the handoff are explicitly not part of this plan — a future, separate
  extension of the same facade if the owner asks for more granular funnels.
