# Plan 138 — Dashboard Traffic Card + Analytics Docs (TASK-262 / TASK-263)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 5 (Адаптив/дизайн + прев'ю
> контенту + хвости)
> **Origin:** `docs/handoff-2026-07-07.md` Block E «Аналітика відвідувань і воронка» ·
> `docs/plans/125-umami-analytics.md` (TASK-261) Out of Scope, which explicitly deferred both
> tasks here: "TASK-262 (mirroring 2–3 Umami numbers into the admin dashboard — parked 'phase
> 2, only if the owner asks after a month of using Umami's own UI')" and "TASK-263 (the full
> plain-language admin-guide chapter)"
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG tasks:** TASK-262, TASK-263
> **Implemented on branch:** `feature/138-dashboard-docs` (single worktree, both tasks)
> **Depends on:** TASK-261 (plan 125, ✅ done) — Umami is live, the six events are wired, and
> `docs/admin-guide.md` already has the `## Аналітика` stub with the `### Налаштування
воронки` subsection this plan expands around.

## Overview

TASK-261 (plan 125) shipped self-hosted Umami analytics end-to-end — the dev-compose service,
the storefront tracker script, and the six e-commerce event call sites — but deliberately drew
two lines around its own scope: no admin-dashboard traffic widget, and no full plain-language
"what is a visit/conversion/funnel" guide chapter. Both were explicitly deferred as their own
later tasks. This plan picks up exactly those two loose ends, per the owner's decision to keep
TASK-262 at **minimum scope**: a single "Відвідуваність" card on the admin dashboard that links
out to Umami's own UI — no chart-rebuilding, no Umami API integration, nothing that duplicates
what Umami's own interface already does well. TASK-263 is the plain-Ukrainian explanation the
owner (a non-technical shop operator) needs to actually use that UI once they get there.

Both tasks are small, file-disjoint from every other in-flight Wave-5 task, and are bundled into
one plan/one branch because they are two small, related, independently-shippable pieces of the
same "make Umami usable for a non-technical owner" story — not because they share any code.

## Scope

### In Scope

- A new "Відвідуваність" (traffic) card on the `store-admin` dashboard
  (`app/(dashboard)/dashboard-view.tsx`) that renders an outbound link to the store's own Umami
  website dashboard, driven by a new, `store-admin`-only optional env var. Graceful muted state
  (no crash, no dead link) when the env var is unset.
- Expanding the existing `## Аналітика` stub in `docs/admin-guide.md` (added by TASK-261, plan
  125 §Design Decision 4) with the full plain-language explanation the stub's own
  `<!-- TASK-263 expands... -->` marker promises: what a visit/unique visitor/conversion/funnel
  is, how to read the already-documented funnel report, which six events the store sends, and
  why Umami's numbers will never exactly match the dashboard's order counts.
- Folding the new section into the guide's table of contents / numbering (it was added by plan
  125 as an un-numbered trailing section; this plan gives it a proper `22.` slot) and a one-line
  cross-reference from the existing `## 20. Дашборд` section pointing at the new dashboard card.

### Out of Scope

- Any Umami **API** call from `store-admin` — no new endpoint, no server-side fetch, no
  displayed numbers beyond the static outbound link. This is the owner's explicit "min scope"
  decision (BACKLOG TASK-262: "max (only if owner asks) ... do NOT rebuild Umami's charts").
  If the owner asks for 2–3 mirrored numbers after using the min-scope card for a while, that is
  a new, separate follow-up task — not silently added here.
- Any change to the storefront (`store-client`), the six event call sites, the dev-compose
  `umami` service, or the `store-api` CSP widening — all shipped and closed by TASK-261 (plan
  125, ✅). This plan touches only `store-admin` and `docs/admin-guide.md`.
- Any change to the existing `### Налаштування воронки` subsection already written by TASK-261 —
  it stays exactly as-is; TASK-263 only adds new prose **above** it and removes the now-obsolete
  marker comment.
- `CustomerNote`/other unrelated admin-guide chapters, or any other Wave-5 task's files (mobile
  admin shell TASK-258, preview widgets TASK-265/266, etc.) — zero file overlap with those.

## User Stories

1. As the store owner, I want a visible "Відвідуваність" entry point on my dashboard, so I
   remember Umami exists and can jump straight to it instead of hunting for its URL every time.
2. As the store owner, I want the dashboard to still work normally (no error, no broken link)
   before a developer has wired up the Umami dashboard URL, so this feature never blocks or
   breaks my daily dashboard check.
3. As the store owner (not a programmer), I want a plain-language explanation of what "visit",
   "conversion", and "funnel" mean and why Umami's visitor count will never exactly match my
   order count, so I don't mistake normal analytics behavior (ad blockers, bots, no cross-device
   identity) for a bug.

## Technical Design

### Design Decision 1 — a new, `store-admin`-only env var, distinct from the storefront's pair

`store-client`'s `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (plan 125) exist to
**load Umami's tracker script and identify the website being tracked** — they are a script-tag
contract, not a link. `store-admin` needs neither of those; it just needs one clickable URL
pointing at that same website's page inside Umami's own dashboard UI (e.g.
`https://analytics.mystore.ua/websites/<website-id>`). Reusing the storefront's two-var
contract here would force the admin card to hand-construct a dashboard URL from a bare website
ID with an assumed origin/path shape it has no way to verify — fragile and unnecessary for a
single link. A single, purpose-named env var is simpler and matches the existing precedent:
`STOREFRONT_URL` in `apps/store-admin/src/shared/config/site.ts` (TASK-269, plan 131) is
likewise a `store-admin`-only constant, independent from any `store-client` env name, used the
same way — building outbound links for the owner to eyeball.

`apps/store-admin/src/shared/config/site.ts` gains:

```ts
// Full URL to this store's website view inside Umami's own dashboard UI (TASK-262).
// Distinct from store-client's NEXT_PUBLIC_UMAMI_SRC/WEBSITE_ID (plan 125), which load
// Umami's tracker *script* — store-admin never loads that script, it only links out to
// Umami's own UI. Left empty by default: the dashboard's "Відвідуваність" card renders in
// a muted, linkless state rather than crashing or dead-linking. e.g.
// https://analytics.mystore.ua/websites/<website-id>
export const UMAMI_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_UMAMI_DASHBOARD_URL ?? "";
```

### Design Decision 2 — a small, prop-driven, self-contained widget

New widget folder `apps/store-admin/src/widgets/dashboard-traffic/` (mirrors every other
`dashboard-*` widget folder's `index.ts` + `ui/Component.tsx` shape — `dashboard-low-stock`,
`dashboard-top-products`, `dashboard-last-orders`, etc.):

```tsx
// ui/DashboardTrafficCard.tsx
interface DashboardTrafficCardProps {
  /** Defaults to the module-level env constant; overridable for tests. */
  dashboardUrl?: string;
}

export function DashboardTrafficCard({
  dashboardUrl = UMAMI_DASHBOARD_URL,
}: DashboardTrafficCardProps) {
  const configured = Boolean(dashboardUrl);
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="text-sm font-medium text-muted-foreground">
        {dict.dashboard.trafficHeading}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {dict.dashboard.trafficSubtext}
      </p>
      {configured ? (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4"
        >
          {dict.dashboard.trafficOpenLink}
        </a>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground/70">
          {dict.dashboard.trafficNotConfigured}
        </p>
      )}
    </div>
  );
}
```

The `dashboardUrl` prop (defaulting to the env constant) is the deliberate testability seam —
it lets RTL tests assert both the "configured" (link present, correct `href`/`target`/`rel`)
and "not configured" (muted copy, no `link` role in the DOM) states via a plain prop override,
without `jest.resetModules()`/env-var gymnastics (unlike `UMAMI_ENABLED` in `store-client`,
which needs the module-reload dance because it gates a `<Script>` render at the app root; this
card is a plain leaf component, so a prop is simpler and sufficient here). Card visual language
(`rounded-lg border border-border bg-card p-6 shadow-card`, muted-foreground label) copies the
existing `StatCard` styling in `AdminDashboardStats.tsx` verbatim so it reads as "one more
dashboard card," not a visually distinct one-off.

**"Muted state" (not full hide) is the deliberate choice** for the unconfigured case, matching
this plan's brief ("graceful hide **or** muted state"): a muted card that names the feature
("Відвідуваність") but says it isn't wired up yet is more informative to the owner than the card
silently vanishing — it signals "ask your developer to finish this" rather than looking like the
feature was never built. Consistent with the codebase's existing informational-not-error muted
copy pattern (`seo-health-section.tsx`'s `noindexOkLabel`/`defaultsFilledNo` states).

### Design Decision 3 — placement in `dashboard-view.tsx`

Rendered as a standalone card directly above the existing "Швидкі дії" (Quick Actions) section,
after the closing `<Separator className="my-6" />` that currently precedes it. Rationale: like
Quick Actions, this card is pure outbound navigation, not a data-fetched metric tied to
`useAdminDashboardControllerGetSummary`'s `isLoading`/`isError` state — placing it inside that
conditional block (alongside `AdminDashboardStats`) would be misleading, since the card has
nothing to do with whether the summary fetch succeeded. It renders unconditionally, exactly like
`NeedsActionWidget` and `DashboardLastOrdersTable` already do (both self-contained,
independent of the summary fetch — same precedent this card follows, minus the fetch itself
since this card has no fetch of its own).

```tsx
<DashboardLastOrdersTable />

<Separator className="my-6" />

<DashboardTrafficCard />

<Separator className="my-6" />

<section>
  <h3 ...>{dict.dashboard.quickActions}</h3>
  ...
</section>
```

### Design Decision 4 — dictionary additions are append-only, under the existing `dashboard` key

Per this plan's constraint (parallel Wave-5 groups also touch `dictionary.ts`), new keys are
appended inside the **existing** `dashboard: { ... }` object (after `noLastOrders`, the last key
in that block today) — no existing key is renamed, reordered, or reformatted:

```ts
// TASK-262: traffic card (links out to Umami — no numbers rendered here).
trafficHeading: "Відвідуваність",
trafficSubtext: "Трафік, конверсії та воронка продажів — в Umami.",
trafficOpenLink: "Відкрити Umami →",
trafficNotConfigured: "Ще не підключено. Зверніться до розробника.",
```

### Design Decision 5 — admin-guide restructuring stays additive around the existing stub

The `## Аналітика` heading and its `### Налаштування воронки` subsection (TASK-261, plan 125)
are left byte-for-byte intact below the insertion point. This plan:

1. Replaces the `<!-- TASK-263 expands this section... -->` HTML comment (its entire purpose was
   to mark this exact insertion point — plan 125 §Design Decision 4) with new prose covering, in
   the guide's existing plain-UA / **Зроби:**/**Має бути:**-free narrative style (this section is
   explanatory, not a step-by-step runbook like the checklist in §21 — matches the tone of the
   guide's own §2 «Основні поняття (глосарій)», the closest existing precedent for "define a
   term simply"):
   - **Що таке візит / унікальний відвідувач.** One visit vs. one person visiting multiple times.
   - **Що таке конверсія.** The ratio of visitors who complete an action (e.g. reach `purchase`)
     out of all visitors — framed with the store's own funnel, not a generic definition.
   - **Як читати воронку.** How to interpret the four-step funnel numbers already documented in
     `### Налаштування воронки` below — where visitors drop off, which step to investigate first.
   - **Які події ми надсилаємо.** The six event names already listed at the top of the existing
     stub (`view_product`, `add_to_cart`, `begin_checkout`, `purchase`, `search`,
     `newsletter_subscribe`) with one plain-UA line each on what triggers it (source of truth:
     `apps/store-client/src/shared/lib/analytics.ts`'s `AnalyticsEvent` type + the six call sites
     — `product-detail-view.tsx`, `add-to-cart-button.tsx`, `checkout-view.tsx`,
     `order-confirmation-view.tsx`, `search-results-view.tsx`,
     `newsletter-subscribe-form.tsx`).
   - **Чому цифри Umami не збігаються із замовленнями в дашборді.** Ad blockers/privacy
     extensions strip Umami's script; bots/crawlers inflate raw visit counts Umami tries to
     filter but never perfectly; a single person on multiple devices/browsers counts as multiple
     visitors (no cross-device identity, unlike a logged-in order). Framed as "this is normal and
     expected, not something to fix" — mirrors the existing tone of `## 20. Дашборд`'s own
     "Низький запас — не помилка, а нагадування" line (a proven "reassure the owner this isn't a
     bug" pattern already in this doc).
2. Gives the section a proper number and anchor, consistent with every other `##`-level section
   in the guide (`## Зміст` currently stops at `21`, and `## Аналітика` has no `<a id>` — both
   artifacts of it being added by plan 125 as a narrow, non-integrated stub):
   - `## Аналітика` → `## 22. Аналітика`, with `<a id="22-analityka"></a>` immediately above it
     (matching every other section's `<a id="N-slug"></a>` placement one blank line above its
     `##` heading).
   - New `## Зміст` line: `22. [Аналітика](#22-analityka)`.
   - The intro's `> **Структура посібника.**` paragraph range "розділи 12–21" → "розділи 12–22"
     (one-word range fix, not a rewrite of the paragraph).
   - The closing `_На цьому посібник завершено..._` line's "Частина 2 (розділи 12–21)" wording,
     if it names the range explicitly, gets the same one-number bump — read the current line
     before editing; only the number changes, not the surrounding sentence.
3. Adds one new bullet to the existing `## 20. Дашборд` section referencing the new card by its
   exact on-screen label ("Відвідуваність") and pointing at `## 22. Аналітика` for the full
   explanation — a two-line addition, not a rewrite of that section. This is the only
   cross-reference tying TASK-263's docs to TASK-262's UI; if TASK-262 changes the card's copy
   before merge, this bullet's wording must match the shipped `dict.dashboard.trafficHeading`
   value exactly.

No other section of `docs/admin-guide.md` is touched.

## Tasks

### TASK-262: "Відвідуваність" traffic card on the admin dashboard (min scope — link only)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — a static leaf component with no business logic/calculation; still fully
RTL-tested per the acceptance criteria below.
**Depends on:** — (TASK-261/plan 125 is a soft prerequisite — already ✅ — for the Umami
dashboard to exist at all; no file dependency)

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/config/site.ts` gains `UMAMI_DASHBOARD_URL` exactly per
      Design Decision 1 (own env var, empty-string default, no coupling to `store-client`'s
      `NEXT_PUBLIC_UMAMI_SRC`/`NEXT_PUBLIC_UMAMI_WEBSITE_ID` names).
- [ ] New `apps/store-admin/src/widgets/dashboard-traffic/ui/DashboardTrafficCard.tsx` +
      `index.ts` (barrel, mirrors `dashboard-low-stock/index.ts`'s shape) implemented exactly
      per Design Decision 2: `dashboardUrl` prop defaulting to `UMAMI_DASHBOARD_URL`; renders an
      `<a>` (`target="_blank"`, `rel="noopener noreferrer"`) with `dict.dashboard.trafficOpenLink`
      when configured; renders `dict.dashboard.trafficNotConfigured` (no `link` role in the DOM)
      when not — no thrown error, no dead `href=""` link, in either state.
- [ ] `apps/store-admin/src/widgets/index.ts` exports `DashboardTrafficCard` alongside the other
      `dashboard-*` widget exports.
- [ ] `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` renders `<DashboardTrafficCard />`
      unconditionally (not gated on the summary fetch's `isLoading`/`isError`), placed per Design
      Decision 3 (directly above the "Швидкі дії" section).
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` gains the four `dashboard.traffic*` keys
      from Design Decision 4, appended after the existing `noLastOrders` key — **no existing key
      in the `dashboard` object (or anywhere else in the file) is modified, reordered, or
      removed.**
- [ ] `apps/store-admin/.env.example` gains `NEXT_PUBLIC_UMAMI_DASHBOARD_URL=` with a short
      comment distinguishing it from `store-client`'s two Umami env vars (per Design Decision 1's
      code comment).
- [ ] New `DashboardTrafficCard.test.tsx` (RTL, `renderWithProviders`, mirroring
      `seo-health-section.test.tsx`'s per-state `describe` shape): asserts (a) with a
      `dashboardUrl` prop set, a link with `dict.dashboard.trafficOpenLink` renders with the
      correct `href`/`target="_blank"`/`rel="noopener noreferrer"`; (b) with no `dashboardUrl`
      prop (or an explicit empty string), `dict.dashboard.trafficNotConfigured` renders and no
      `role="link"` element exists in the card.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- DashboardTrafficCard` (and the full
      `npm run test -w apps/store-admin` suite stays green — no regression to
      `dashboard-view`-adjacent tests, if any exist).
- [ ] Manual-qa (append to `docs/manual-qa-pending.md`, see Constraints below): opening the link
      on a running stand with `NEXT_PUBLIC_UMAMI_DASHBOARD_URL` set actually lands on the correct
      Umami website page.

**Files to create/modify:**

- `apps/store-admin/src/shared/config/site.ts` — new `UMAMI_DASHBOARD_URL` constant
- `apps/store-admin/src/widgets/dashboard-traffic/ui/DashboardTrafficCard.tsx` — new
- `apps/store-admin/src/widgets/dashboard-traffic/ui/DashboardTrafficCard.test.tsx` — new
- `apps/store-admin/src/widgets/dashboard-traffic/index.ts` — new
- `apps/store-admin/src/widgets/index.ts` — export addition
- `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` — render the card
- `apps/store-admin/src/shared/config/dictionary.ts` — four new `dashboard.traffic*` keys
- `apps/store-admin/.env.example` — new `NEXT_PUBLIC_UMAMI_DASHBOARD_URL` key
- `docs/manual-qa-pending.md` — one new manual-verification entry (see Constraints)

---

### TASK-263: «Аналітика» plain-language section in `docs/admin-guide.md`

**Type:** docs
**Scope:** shared
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-262 (soft — the new §20 cross-reference bullet must name the card's exact
shipped label; write/merge TASK-262 first, or at minimum finalize its `trafficHeading` copy
before writing this bullet)

**Acceptance Criteria:**

- [ ] The `<!-- TASK-263 expands this section... -->` marker comment is removed and replaced with
      the five plain-UA subsections from Design Decision 5 point 1 (visits/unique, conversion,
      reading the funnel, the six events explained, why Umami ≠ order counts) — written in the
      guide's existing non-technical, second-person tone (cross-check against §2 «Основні поняття
      (глосарій)» and §20 «Дашборд» for tone/format before writing).
- [ ] The six event names and their plain-UA trigger descriptions are verified against the actual
      `trackEvent(...)` call sites (`apps/store-client/src/shared/lib/analytics.ts`'s
      `AnalyticsEvent` union + its six call sites) — not re-derived from memory or from this
      plan's own prose, so the guide never drifts from the shipped event names.
- [ ] The existing `### Налаштування воронки` subsection (and everything in it) is left
      byte-for-byte unchanged.
- [ ] `## Аналітика` → `## 22. Аналітика` with `<a id="22-analityka"></a>` added immediately
      above it, matching every other section's anchor placement.
- [ ] `## Зміст` gains `22. [Аналітика](#22-analityka)` as its next line after item 21.
- [ ] The intro's `> **Структура посібника.**` paragraph and the closing
      `_На цьому посібник завершено..._` line both have their "розділи 12–21" range references
      bumped to "12–22" (read the current exact wording before editing — one-number fix only, no
      rewrite of the surrounding sentence).
- [ ] `## 20. Дашборд` gains one short new bullet naming the "Відвідуваність" card (exact copy
      matching the shipped `dict.dashboard.trafficHeading` value from TASK-262) and linking to
      `#22-analityka` for the full explanation.
- [ ] No other section of `docs/admin-guide.md` is modified.
- [ ] `docs/manual-qa-pending.md` gains one new manual-verification entry (see Constraints below)
      — reading the new section against a real Umami funnel on a running stand.

**Files to create/modify:**

- `docs/admin-guide.md`
- `docs/manual-qa-pending.md` — one new manual-verification entry

## Migration Steps

1. TASK-262 (traffic card) — implement and get its `trafficHeading` copy finalized first, since
   TASK-263's §20 cross-reference bullet quotes that exact label.
2. TASK-263 (admin-guide section) — write once TASK-262's card copy is settled; both can still be
   committed together on the same branch.

## Constraints (from the orchestrating task brief)

- **Dictionary is append-only.** All four new `dashboard.traffic*` keys are appended after the
  existing `dashboard.noLastOrders` key. No existing key anywhere in
  `apps/store-admin/src/shared/config/dictionary.ts` is touched — other Wave-5 groups running in
  parallel worktrees also edit this file, and a merge conflict on an unrelated key would be an
  unnecessary, avoidable collision.
- **`BACKLOG.md` is not edited by this plan or its implementation** — the orchestrator manages
  task-status rows; this plan document and its own two `TASK-` acceptance-criteria checklists are
  the implementation-level source of truth for what "done" means for TASK-262/263.
- **`docs/manual-qa-pending.md`** — append one new section per task at the end of the file (this
  plan uses the file's own established `### TASK-NNN — <title>` heading level — the same level
  every other entry in that file already uses, e.g. `### TASK-269 — SEO-здоров'я` — rather than a
  bare `##`, so the new entries read consistently with the rest of the file and don't imply a new
  top-level `## N. Етап` grouping they don't belong to). Suggested content:
  - `### TASK-262 — Картка «Відвідуваність»` — one item: set
    `NEXT_PUBLIC_UMAMI_DASHBOARD_URL` on a running admin stand, open the dashboard, click the
    card's link, confirm it opens the correct Umami website page in a new tab; then unset the
    env var and confirm the card shows the muted "не підключено" copy with no console error.
  - `### TASK-263 — Розділ «Аналітика» в посібнику` — one item: with real events flowing in
    Umami (the TASK-261 funnel already configured), read the new plain-language section
    side-by-side with the live Umami funnel report and confirm the numbers/terms described match
    what the owner actually sees in Umami's UI.

## Risks & Mitigations

| Risk                                                                                                                                                 | Mitigation                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The owner later asks for the "max" scope (2–3 mirrored Umami numbers via its API) — a temptation to scope-creep this task while it's open            | Explicitly out of scope per the owner's own BACKLOG decision; if asked, it becomes a new, separate follow-up task with its own plan, not a mid-flight addition here |
| TASK-263's §20 cross-reference bullet quotes TASK-262's card label verbatim — if the label changes after the doc is written, they drift              | Migration Steps sequences 262 before 263 specifically to avoid this; acceptance criteria call out the exact-match requirement explicitly                            |
| Editing the guide's TOC/numbering/closing-line ranges by hand risks an off-by-one or a stray edit to unrelated prose                                 | Acceptance criteria require reading the current exact wording before editing each of the three touch points, and scope each to a one-number bump — not a rewrite    |
| Six event names in the new prose drift from the actual shipped `AnalyticsEvent` union if copied from this plan's own text instead of the source file | Acceptance criteria explicitly require verifying against `apps/store-client/src/shared/lib/analytics.ts` and its six call sites, not against this plan's prose      |

## Notes

- This plan intentionally does not touch `apps/store-client/**`, `apps/store-api/**`, or the
  dev-compose `umami` service — everything storefront/backend-side was already shipped and
  closed by TASK-261 (plan 125, ✅). Both tasks here are `store-admin` + docs only.
- If a future task ever adds the "max scope" Umami-API mirror to the dashboard card, it should
  extend `DashboardTrafficCard` (or sit beside it) rather than replace it — the muted/link-only
  card remains a reasonable fallback state for stands where the owner hasn't set up Umami's API
  access yet, distinct from the simpler "dashboard URL not configured" muted state this plan
  ships.
