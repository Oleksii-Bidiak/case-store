# Plan 128 — Nav Dead Links (admin sidebar + storefront footer)

> **Status:** ✅ Done (2026-07-08)
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), **Block B**
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-184

## Overview

Two unrelated dead-link fixes, bundled into one plan/worktree because they are both tiny,
frontend-only, `[B/H]` quick-wins with zero API-contract impact:

1. **Admin sidebar** (`store-admin`): `bottomNavItems` has a `«Налаштування»` entry whose `href`
   is the literal string `"#"` — it renders, is clickable, and does nothing. There is no
   `/settings` index route to point it at (only `/settings/contact` and `/settings/seo` exist,
   both already separately linked in the same bottom-nav group).
2. **Storefront footer** (`store-client`): the `«Інформація»` column has four `FooterLink`s that
   all point at `/products` — a copy-paste placeholder from before the legal-pages/info-hub/FAQ
   surfaces existed. This is UX audit finding **F-17** (plan 103 §5/§6).

### Owner-locked decision (footer «Інформація» mapping)

The footer links are an **SEO-oriented mix**, not a uniform "point everything at one page" fix:

- **«Про нас»** → `/info#about` — content lives on the info hub, not a dedicated page.
- **«Часті питання»** → `/info#faq` — the `FAQPage` JSON-LD (TASK-242) is emitted on `/info`;
  that is the SEO-canonical spot for the FAQ content. A separate `/faq` page would duplicate the
  rich-result target and dilute it.
- **«Гарантія та сервіс»** + **«Доставка й оплата»** → dedicated `/legal/<slug>` pages, rendered
  **dynamically** from admin-published pages via `fetchPublishedPages()`. The footer link set for
  this pair is "whatever legal pages the admin has published," not two hardcoded hrefs — so there
  is **no 404 risk**: an unpublished legal page simply doesn't appear as a footer link instead of
  linking to a page that 404s. This closes **F-17**.

This plan does not invent a new "delivery & payment" or "warranty" page — it makes the footer
render whatever `Page` rows the admin has actually published under `/legal`, plus two fixed
anchors into the existing `/info` hub, plus the already-correct `/blog` link.

## Scope

### In Scope

- Remove the dead `«Налаштування»` bottom-nav item from `AdminNavList` (shared by the desktop
  sidebar and the mobile drawer — fixing it here fixes both).
- Drop the now-unused `dict.nav.settings` dictionary key and the now-unused `Settings` icon import
  in `admin-nav-list.tsx`.
- Rewire the storefront footer's `«Інформація»` column to: two fixed `/info#<section>` anchors
  (`about`, `faq`) + a dynamic list of currently-published legal pages (`/legal/<slug>`, title
  from the page) + the existing `/blog` link (unchanged).
- Fetch published pages in `Footer()` via the existing `fetchPublishedPages()` helper
  (`apps/store-client/src/shared/api/pages-server.ts`) — already ISR-tagged, already used by
  `/legal` and `/legal/[slug]`; no new fetcher, no new cache-tag wiring.
- Drop the now-unused `dict.footer.infoDelivery` / `dict.footer.infoWarranty` dictionary keys (the
  footer no longer renders fixed labels for those two slots — the label now comes from whatever
  the admin titled the published page).
- Remove the stale "storefront-safe placeholders until admin `/legal/[slug]` pages are wired
  (TASK-153/TASK-166)" code comment above the `«Інформація»` block — both of those are long since
  shipped.
- New `footer.test.tsx` (none exists today) covering the rewired `«Інформація»` column.
- Update `admin-nav-list.test.tsx` if/only-if an existing assertion depends on the removed item
  (grounding check below found none — see Design Decision 1).

### Out of Scope

- Any new admin `/settings` index route — the two existing sub-sections
  (`/settings/contact`, `/settings/seo`) are already independently reachable; a merged index page
  is not requested and not needed to close the dead-link bug.
- Any change to `/legal` (the hub page) or `/legal/[slug]` (the detail page) — both already render
  correctly off `fetchPublishedPage(s)`; this plan only changes what links _into_ them from the
  footer.
- Publishing any actual legal-page content (seeding `Page` rows) — that is an admin-panel content
  task for the owner, not a code task. Zero published legal pages is a valid, already-correct
  state after this plan ships (the two `/info` anchors + `/blog` still render).
- Any other UX-audit finding from plan 103 besides F-17 (e.g. F-18 social `#` links is TASK-267,
  plan 129 — deliberately split out, see Dependencies & Sequencing below).
- Any backend change, Prisma migration, or Orval regeneration — both fixes are pure frontend
  rewiring of existing, already-shipped endpoints/routes.

## Technical Design

### Admin sidebar

`apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — `bottomNavItems` (L52–58) currently
has 5 entries; the last one is dead:

```ts
const bottomNavItems = [
  { label: dict.nav.contentMap, href: "/content-map", icon: Map },
  { label: dict.nav.siteContact, href: "/settings/contact", icon: Phone },
  { label: dict.nav.seoSettings, href: "/settings/seo", icon: Search },
  { label: dict.nav.faq, href: "/faq", icon: HelpCircle },
  { label: dict.nav.settings, href: "#", icon: Settings }, // ← removed
];
```

Fix: delete that array entry, the `Settings` import from `lucide-react` (L22), and the
`dict.nav.settings` key (`apps/store-admin/src/shared/config/dictionary.ts` L35). Grounding check
confirmed `dict.nav.settings` and `href === "#"` are referenced nowhere else in `store-admin` — no
other component, and no existing test in `admin-nav-list.test.tsx` or `admin-sidebar.test.tsx`
asserts on the removed item, so no test file needs an update beyond the (optional) new negative
assertion in Design Decision 1 below.

#### Design Decision 1 — `isNavItemActive`'s `href === "#"` guard: leave it in place

`isNavItemActive` (L64–68) has an explicit early-return for `href === "#"`. After this fix, no
`bottomNavItems`/`navItems` entry uses `"#"` any more, so the guard becomes dead code in the
strict sense. **Decision: keep it, unchanged.** It is a one-line, zero-risk defensive guard (a
future placeholder nav item added the same way this one originally was won't render as
"active"/highlighted); removing it would be a pure code-churn diff with no bug-fix value and would
remove a small safety net for the next person who copies this pattern. This mirrors the "no
unnecessary code churn" bias already used elsewhere in this codebase (e.g. TASK-235 kept
deprecated fields rather than force a breaking removal).

### Storefront footer

`apps/store-client/src/widgets/footer/ui/footer.tsx` is already an **async Server Component**:

```ts
export async function Footer() {
  const year = new Date().getFullYear();
  const contact = await fetchSiteContactSettings();
  // ...
}
```

Change to fetch both the contact settings and the published legal pages **in parallel** (avoids
turning one sequential `await` into a two-hop waterfall):

```ts
const [contact, legalPages] = await Promise.all([
  fetchSiteContactSettings(),
  fetchPublishedPages(),
]);
```

`fetchPublishedPages()` (`apps/store-client/src/shared/api/pages-server.ts:57`) already returns
`PageEntity[]` (each with `slug` + `title`), already tagged (`next: { tags: [PAGES_COLLECTION_TAG]
}`) for on-demand revalidation, and already never throws (empty array on any transport error) — so
this footer change adds **zero** new caching/error-handling logic, it only calls an existing
helper a second time from a second call site (`/legal`, `/legal/[slug]`, and now `Footer` all share
it — React's per-request fetch dedup means concurrent renders of `/legal` + footer on the same
request don't double-fetch).

#### Design Decision 2 — column render order and the zero-published-pages case

Replace the current 4-line placeholder block (`apps/store-client/src/widgets/footer/ui/footer.tsx`
L120–131) with:

```tsx
{
  /* Інформація — TASK-184: two fixed /info anchors (About, FAQ — FAQPage JSON-LD
    lives on /info per TASK-242, so it is not duplicated as a separate route),
    a dynamic list of published legal pages, then the existing /blog link. */
}
<div className="flex flex-col gap-3">
  <h2 className="font-display text-sm font-bold">{dict.footer.infoTitle}</h2>
  {legalPages.slice(0, FOOTER_LEGAL_LINKS_LIMIT).map((page) => (
    <FooterLink key={page.slug} href={`/legal/${page.slug}`}>
      {page.title}
    </FooterLink>
  ))}
  <FooterLink href="/info#about">{dict.footer.infoAbout}</FooterLink>
  <FooterLink href="/info#faq">{dict.footer.infoFaq}</FooterLink>
  <FooterLink href="/blog">{dict.footer.infoBlog}</FooterLink>
</div>;
```

- **Order:** dynamic legal-page links first, then the two fixed `/info` anchors, then `/blog` —
  this preserves the original 5-slot visual position parity (delivery/warranty were slots 1–2,
  about/faq were slots 3–4, blog was slot 5) as closely as a variable-length dynamic list allows.
- **Zero published legal pages:** the dynamic `.map()` renders nothing and the column still shows
  three links (About, FAQ, Blog) — never an empty or broken-looking column. This is the expected
  state until the owner publishes legal pages in the admin panel (confirmed via TASK-209: seed
  creates zero `Page` rows).
- **`FOOTER_LEGAL_LINKS_LIMIT = 6`** (a small local `const` in `footer.tsx`, not a new shared
  config): a defensive cap so the footer column can't grow unboundedly long if the admin ends up
  publishing many `Page` rows for other purposes (e.g. a large body of standalone content pages
  that aren't meant to be "legal" footer links). `/legal` (the hub) still lists **all** published
  pages regardless of this cap — only the footer's rendering is capped. Not a hard requirement from
  the owner-locked decision, but cheap and low-risk; documented here so a future change to the cap
  is a one-line diff, not an investigation.
- `/info#about` and `/info#faq` are valid, already-working deep links: `InfoView`
  (`apps/store-client/src/widgets/info-support/ui/info-view.tsx` L107–113) adopts
  `window.location.hash` into its `section` state after mount (rAF-deferred to avoid a hydration
  mismatch), and `about`/`faq` are members of `INFO_SECTIONS`
  (`apps/store-client/src/widgets/info-support/model/info-content.ts` L14–20). This is a
  client-side section switch, not a native scroll-to-anchor — noted here since it's the mechanism
  that makes the two fixed links land on the right content, not a scroll position.

#### Design Decision 3 — drop the now-orphaned `infoDelivery`/`infoWarranty` dict keys

`dict.footer.infoDelivery` ("Доставка й оплата") and `dict.footer.infoWarranty` ("Гарантія та
сервіс") are used **only** in the footer's placeholder block being replaced (grounding check:
`grep infoDelivery|infoWarranty` across `apps/store-client/src` returns exactly those two
dictionary lines + the two `footer.tsx` usages, nothing else). After this fix, those two footer
slots render whatever title the admin gave their published `/legal/<slug>` pages — there is no
longer a fixed UA label for "delivery" or "warranty" specifically, since a footer entry could be
any published legal page. Delete both keys rather than leaving them as dead exports. (The owner is
still free to title their published pages "Доставка й оплата" / "Гарантія та сервіс" in the admin
panel — the _words_ aren't lost, just the hardcoded dictionary binding to a placeholder link.)

### API Contract

No changes. `fetchPublishedPages()` and `fetchSiteContactSettings()` are both pre-existing,
already-tagged server fetchers hitting endpoints that already exist
(`GET /api/pages?page=1&limit=100`, `GET /api/site-contact`). No Orval regeneration in any app —
`store-api` is untouched by this plan.

## Tasks

### TASK-184-A: Remove the dead admin sidebar `«Налаштування»` link

**Type:** fix
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — a one-line deletion, not cart/discounts/inventory/auth; still covered by an
explicit regression assertion below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `bottomNavItems` in `admin-nav-list.tsx` no longer contains an item with `href: "#"`; the
      remaining 4 bottom-nav entries (`content-map`, `siteContact`, `seoSettings`, `faq`) render in
      their existing order, unchanged
- [ ] `Settings` import from `lucide-react` removed (no longer referenced anywhere in the file)
- [ ] `dict.nav.settings` key removed from `apps/store-admin/src/shared/config/dictionary.ts`
      (confirmed via grep: no other reference in `store-admin`)
- [ ] `isNavItemActive`'s `href === "#"` guard is left unchanged (Design Decision 1 — not a bug, a
      no-op defensive branch; do not remove it as part of this task)
- [ ] `admin-nav-list.test.tsx`: new assertion that no rendered nav link has `href="#"` (regression
      guard against this exact bug recurring), e.g.
      `screen.getAllByRole("link").every((l) => l.getAttribute("href") !== "#")`
- [ ] `admin-sidebar.test.tsx` and `mobile-nav-drawer.test.tsx` (if either exists and renders
      `AdminNavList`) require no changes — confirmed via grounding that neither references the
      removed item directly; re-run to confirm no incidental breakage
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — remove dead item + `Settings`
  import
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.test.tsx` — new no-`href="#"` assertion
- `apps/store-admin/src/shared/config/dictionary.ts` — remove `dict.nav.settings`

---

### TASK-184-B: Storefront footer «Інформація» — real `/info`, `/legal/*`, `/blog` links

**Type:** fix
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — UI rewiring of existing routes, not cart/discounts/inventory/auth; covered
by a new RTL test per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `Footer()` fetches `fetchSiteContactSettings()` and `fetchPublishedPages()` via
      `Promise.all` (not two sequential `await`s)
- [ ] `«Інформація»` column renders, in order: up to `FOOTER_LEGAL_LINKS_LIMIT` (6) published
      legal-page links (`/legal/<slug>`, label = `page.title`), then `/info#about`
      (`dict.footer.infoAbout`), then `/info#faq` (`dict.footer.infoFaq`), then `/blog`
      (`dict.footer.infoBlog`, unchanged from today)
- [ ] Zero published pages → column still renders exactly 3 links (About, FAQ, Blog) — no empty
      or visibly broken column
- [ ] The stale `L120–121` "storefront-safe placeholders... TASK-153/TASK-166" code comment is
      removed and replaced with a comment describing the current (real) wiring
- [ ] `dict.footer.infoDelivery` and `dict.footer.infoWarranty` removed from
      `apps/store-client/src/shared/config/dictionary.ts` (Design Decision 3); confirmed no other
      reference remains (`grep infoDelivery|infoWarranty` returns nothing)
- [ ] `footer.test.tsx` (new — none exists today): MSW-stubs `GET */api/site-contact` and
      `GET */api/pages*`; renders `await Footer()` via `render()`; asserts (a) with 2 stubbed
      published pages, both render as `/legal/<slug>` links with the page's title as link text;
      (b) with an empty pages array, the column still shows exactly the About/FAQ/Blog links and
      no `/legal/` link; (c) the About/FAQ links point at `/info#about`/`/info#faq` respectively;
      (d) no link in the column points at `/products` (regression guard against this exact bug)
- [ ] Manual check (documented, not required to pass automated CI): from the live storefront
      footer, clicking «Про нас» lands on `/info` with the About section active, clicking «Часті
      питання» lands on `/info` with the FAQ section active and the `FAQPage` JSON-LD present
      (existing TASK-242 behavior, unaffected by this change) — add to
      `docs/manual-qa-pending.md` if not already covered
- [ ] `npm run build`/`lint`/`typecheck` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/footer/ui/footer.tsx` — `Promise.all` fetch, rewired
  `«Інформація»` block, `FOOTER_LEGAL_LINKS_LIMIT` constant, comment cleanup
- `apps/store-client/src/widgets/footer/ui/footer.test.tsx` — new
- `apps/store-client/src/shared/config/dictionary.ts` — remove `infoDelivery`/`infoWarranty`

## Dependencies & Sequencing

- **Internal:** TASK-184-A and TASK-184-B are fully independent (different apps, different files)
  — either can land first, or in parallel commits within the same worktree.
- **Shared worktree with TASK-267** (plan 129): both tasks are implemented together on branch
  `feature/184-267-nav-stub`, frontend-only, no API-contract change in either. Overlap is minimal:
  TASK-184-B touches `footer.tsx` + `dict.footer.*`; TASK-267 touches
  `widgets/newsletter`/`widgets/blog/ui/blog-newsletter.tsx` + `dict.home.newsletter.*` /
  `dict.blog.newsletter.*`. Both add/remove keys in `apps/store-client/src/shared/config/dictionary.ts`
  but in disjoint sections (`footer` vs `home.newsletter`/`blog.newsletter`) — no line-level
  conflict expected; if both are edited in the same session, land TASK-184-B's dictionary edit
  first (it only _removes_ two keys, a smaller diff) to keep the merge trivial.
- **External:** `fetchPublishedPages()` (TASK-187/209) and `InfoView`'s hash-adoption (pre-existing)
  are both already merged into `develop` — no upstream dependency is still in flight.
- Closes UX-audit finding **F-17** (plan 103 §5/§6) outright; **F-18** (the social `#` links in
  the same finding pair) is deliberately handled by TASK-267/plan 129, not here — the two findings
  are unrelated code paths (footer nav links vs. newsletter/blog social icons) that only happened
  to be reported together.

## Risks & Mitigations

| Risk                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footer renders a `/legal/<slug>` link to a page that gets un-published (draft) between the ISR fetch and a user's click                        | Not a new risk introduced here — `/legal/[slug]` already `notFound()`s on a draft/missing slug (TASK-209); the footer only ever lists _currently published_ pages at fetch time, and the 1-hour ISR floor + on-demand `revalidateTag("pages")` on every admin write (TASK-187) keeps that window small                                                      |
| `FOOTER_LEGAL_LINKS_LIMIT = 6` silently drops legal pages 7+ from the footer with no visible "see all" affordance                              | `/legal` (already linked from the footer's own... actually not currently linked directly — noted as a follow-up, not blocking: if the owner publishes >6 legal pages, a small follow-up could add a "Всі документи →" `/legal` link to the column; out of scope for this quick-win since zero pages are published today (TASK-209)                          |
| Removing `dict.nav.settings` / `infoDelivery` / `infoWarranty` breaks an unnoticed reference                                                   | Confirmed via `grep` across each app's `src` before removal (documented in Design Decisions 1 and 3); `npm run typecheck` for each app would fail loudly on any missed reference since `dict` is a single typed const, not untyped JSON                                                                                                                     |
| New `footer.test.tsx` is the first test in the repo to render an **async** Server Component (`await Footer()`) — no existing precedent to copy | Documented explicitly in the acceptance criteria as `render(await Footer())` inside an `async` test body, MSW-stubbing the two underlying endpoints exactly as `Footer()` calls them; this is a standard RTL pattern for async Server Components (await the component call, render the resolved element) and does not require any new test-harness plumbing |

## Notes

- This plan intentionally does **not** touch `SOCIAL_LINKS` (the footer's own Telegram/Viber/
  Instagram icons, L21–25/79–102) — those are already correctly wired to `SiteContactSettings` and
  already hidden when unset (`hasSocials` guard). They are not part of F-17 and were previously
  misidentified in the original TASK-267 backlog description as a "social `#` link" — the actual
  dead `#` social links live in the **homepage newsletter** and **blog newsletter** widgets, which
  is exactly what TASK-267/plan 129 fixes.
- If the owner later wants footer "Гарантія та сервіс"/"Доставка й оплата" to be guaranteed-present
  (not contingent on the admin remembering to publish them), the cheapest follow-up is **not** more
  frontend code — it's simply publishing those two `Page` rows in `/pages` once, which the admin
  guide (`docs/admin-guide.md`) already documents how to do.
