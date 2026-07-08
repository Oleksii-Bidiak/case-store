# Plan 129 — Storefront Stub Audit

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), **Block B**
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-267

## Overview

The storefront has a number of UI surfaces that are visually complete but not (yet) backed by real
logic — cart add-on services, account loyalty/notifications, product compare, social sign-in,
social share links, promo CTAs. Several of these are deliberately-planned future features (each
already has, or will get, its own BACKLOG task) that were intentionally shipped _visible_ so the
storefront reads as feature-complete to a visiting customer, rather than shipped hidden and
"discovered" as missing later.

### Owner-locked decision

**The stubs stay visible.** This task is an **audit document**, not a hide-until-built task —
despite the original BACKLOG row's wording ("per item decide hide-until-built (default) or
build"), the owner's actual direction is the opposite default: **KEEP visible, logic ships later**.
For each stub found:

1. Record it: location (file + approximate line), what it does today, what's missing.
2. Link it to its future BACKLOG task ID (most already have one).
3. Decision = **KEEP** (the stub stays visible; no hide/remove commit).
4. Only where a link is **genuinely dead** — an `href="#"` that does nothing but jump to the top of
   the page, with no future-feature affordance at all — make it **honest**: swap it for a
   `toast()`/disabled affordance (reusing the toast-stub pattern already established by
   `dict.product.compareStub` / `dict.auth.login.socialSoon` in this codebase), so a customer
   clicking it gets a "coming soon" signal instead of nothing happening.

This plan's only code change is that last bullet, applied to the two genuinely-dead `#` anchors
found (Design Decision 2). Every other stub in the audit table below needs **no code change** —
it is either already interactive-but-unpersisted (fine, tracked), or already has an honest
toast/placeholder (fine, no action).

## Scope

### In Scope

- The full audit table (below) — one row per storefront stub found by grounding the codebase,
  each with location, future task-ID, KEEP decision, and whether an honest-affordance change is
  needed.
- Converting the two genuinely-dead `href="#"` social-link lists (homepage newsletter, blog
  newsletter — UX-audit finding **F-18**, plan 103 §5/§6) into an honest toast affordance,
  matching the existing `toast(dict.auth.login.socialSoon)` / `toast(dict.product.compareStub)`
  pattern already used elsewhere in `store-client`.
- New dictionary keys (`dict.home.newsletter.socialSoon`, `dict.blog.newsletter.socialSoon`) for
  the toast copy.
- Component tests for the two affected widgets confirming the honest-affordance behavior.

### Out of Scope

- Hiding, removing, or feature-flagging **any** other stub in the table — explicitly against the
  owner-locked decision.
- Building the actual backend/logic for any stubbed feature (add-on services TASK-174, loyalty
  TASK-175, compare TASK-085, quick-view TASK-086, social login TASK-168) — this plan only audits
  and, for the one dead-link case, makes the current stub honest. None of those future tasks are
  implemented here.
- The footer's **own** social links (Telegram/Viber/Instagram icons,
  `apps/store-client/src/widgets/footer/ui/footer.tsx` L21–25/79–102) — already correctly wired to
  `SiteContactSettings` and already hidden when unset. These were previously miscited as part of
  F-18 in the original BACKLOG row; grounding confirms they are not a stub and need no change (see
  Notes).
- The promo-tile `#` CTAs (`dictionary.ts` "КРЕДИТ 0%" / "TRADE-IN") — audited below and left as
  `KEEP`/no-change, since `#` there is the _empty-fallback_ state of an admin-configurable link,
  not a permanently broken feature (see audit table row 10).
- The footer «Інформація» placeholder links — that is **F-17**, fixed by TASK-184/plan 128, not
  this plan (see Dependencies & Sequencing).
- Any backend change, Prisma migration, or Orval regeneration.

## Technical Design

### The audit table

Grounded 2026-07-08 against `develop`. "Honest-affordance needed" = `YES` only where this plan
makes a code change; everywhere else the existing state already satisfies KEEP.

| #   | Stub                                                                                                                                                                          | Location                                                                                                                                                                                                                                                                               | Future task                                                                                                                                             | Decision                                                                                 | Honest-affordance needed?                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cart add-on services (warranty cert / insurance / setup) — client-state-only, totalled in the cart summary, **not** persisted through checkout                                | `widgets/cart/model/addon-services.ts` (static `ADDON_SERVICES`); toggled in `cart-item-row.tsx` (~L60); totalled in `cart-view.tsx` (L31) → `cart-summary.tsx` (L11)                                                                                                                  | TASK-174                                                                                                                                                | **KEEP**                                                                                 | No — already fully interactive (checkbox toggle, live total), not a dead link; the gap is persistence, not affordance                                                                                                                                                                                                        |
| 2   | Account loyalty/bonuses — hardcoded `0 ₴` balance                                                                                                                             | `widgets/account/ui/account-bonuses-section.tsx`                                                                                                                                                                                                                                       | TASK-175                                                                                                                                                | **KEEP**                                                                                 | No — already carries an honest `d.bonusesStub` note (L43) explaining it's not live yet                                                                                                                                                                                                                                       |
| 3   | Account notification preferences — 3 toggles, local `useState` only, not persisted                                                                                            | `widgets/account/ui/account-settings-section.tsx` (L14–21, `notifs` state)                                                                                                                                                                                                             | TASK-175                                                                                                                                                | **KEEP**                                                                                 | No — already carries an honest `d.notifStub` note (L79)                                                                                                                                                                                                                                                                      |
| 4   | Account "appearance" theme setting — text-only note, no actual toggle exists                                                                                                  | `widgets/account/ui/account-settings-section.tsx` (L29–36, `appearanceNote`)                                                                                                                                                                                                           | TASK-175 (bundled with notification prefs)                                                                                                              | **KEEP**                                                                                 | No — already an honest note, not an interactive control at all                                                                                                                                                                                                                                                               |
| 5   | Account purchases / order-history / compare placeholders — "coming soon" cards with a CTA to the nearest real page                                                            | `widgets/account/ui/account-view.tsx` (nav + `switch`) → `widgets/account/ui/account-placeholder-section.tsx`                                                                                                                                                                          | TASK-175 / TASK-085                                                                                                                                     | **KEEP**                                                                                 | No — already an honest placeholder card with a working CTA link                                                                                                                                                                                                                                                              |
| 6   | Compare button on PDP — toast on click                                                                                                                                        | `widgets/product-detail/ui/product-detail-view.tsx` L222–228, `onClick={() => toast(dict.product.compareStub)}`                                                                                                                                                                        | TASK-085                                                                                                                                                | **KEEP**                                                                                 | No — already an honest toast                                                                                                                                                                                                                                                                                                 |
| 7   | Quick-view modal                                                                                                                                                              | — no UI exists anywhere in `store-client`; grounding search found zero references to a quick-view trigger/modal                                                                                                                                                                        | TASK-086                                                                                                                                                | **KEEP** (nothing to audit — the feature has no stub yet, it simply hasn't been started) | N/A — not present, so nothing to make honest                                                                                                                                                                                                                                                                                 |
| 8   | Social sign-in (Google / Apple) — toast on click                                                                                                                              | `features/auth/ui/login-form.tsx` L199–222, both buttons call `toast(dict.auth.login.socialSoon)`; **register form has no mirror of these buttons** (grounding search for `GoogleIcon`/`AppleIcon`/`socialSoon` across `store-client` returns only `dictionary.ts` + `login-form.tsx`) | TASK-168 (parked)                                                                                                                                       | **KEEP**                                                                                 | No — already an honest toast; the register form simply never had social buttons to begin with, so there's no asymmetry to fix                                                                                                                                                                                                |
| 9   | Social channel links — homepage newsletter block, `href="#"`, plain anchors, no click handler at all                                                                          | `widgets/newsletter/ui/newsletter.tsx` L28–43; `dict.home.newsletter.socials` (`dictionary.ts` L313–318)                                                                                                                                                                               | F-18 (plan 103) — no dedicated future BACKLOG task; channels get real URLs once the owner has them, tracked as a content/config change, not a code task | **KEEP** (build later — the icons/labels stay; only the click behavior changes)          | **YES** — this is the genuinely-dead case this plan fixes (Design Decision 2)                                                                                                                                                                                                                                                |
| 10  | Social channel links — blog newsletter block, same pattern, one fewer channel (no Viber)                                                                                      | `widgets/blog/ui/blog-newsletter.tsx` L34–49; `dict.blog.newsletter.socials` (`dictionary.ts` L351–355)                                                                                                                                                                                | F-18                                                                                                                                                    | **KEEP**                                                                                 | **YES** — same fix as row 9                                                                                                                                                                                                                                                                                                  |
| 11  | Promo-tile CTAs "КРЕДИТ 0%" / "TRADE-IN" — `href: "#"` fallback                                                                                                               | `dictionary.ts` L235, L243 (`promoTiles`/`promoBanners` config), rendered by `promo-tiles.tsx`/`hero-slider.tsx`                                                                                                                                                                       | — (content-managed; no dedicated task — the CTA target becomes real once the owner points the promo at a real page/campaign)                            | **KEEP**                                                                                 | No — `#` here is the _empty-fallback_ value of an admin/content-configurable link, structurally different from rows 9–10 (which have no config path to a real URL at all); clicking a not-yet-configured promo CTA and landing at the top of the page is an acceptable no-op for a marketing tile, not a broken core feature |
| 12  | _(cross-reference only, already tracked, no change)_ Express "Купити в 1 клік" order — toast on click                                                                         | `widgets/product-detail/ui/product-detail-view.tsx` L233–241                                                                                                                                                                                                                           | TASK-178                                                                                                                                                | **KEEP**                                                                                 | No                                                                                                                                                                                                                                                                                                                           |
| 13  | _(cross-reference only)_ Password reset — toast on click                                                                                                                      | `features/auth/ui/login-form.tsx` L176–183                                                                                                                                                                                                                                             | TASK-169                                                                                                                                                | **KEEP**                                                                                 | No                                                                                                                                                                                                                                                                                                                           |
| 14  | _(cross-reference only)_ Checkout payment method + "списати бонуси" — local-state-only, doesn't affect the order; honest `paymentStubNote`/`bonusesStub` copy already present | `widgets/checkout/ui/checkout-payment-stub.tsx`                                                                                                                                                                                                                                        | TASK-034 (parked, real payments) / TASK-175 (bonuses)                                                                                                   | **KEEP**                                                                                 | No — already carries honest stub copy (L22–24, L109–111)                                                                                                                                                                                                                                                                     |

Rows 12–14 are included for completeness (the BACKLOG row's prose references them) but are **not**
re-decided here — they're already `KEEP` with an honest affordance today; listing them closes the
loop that this audit is exhaustive over every storefront stub, not just the ones needing a code
change.

### Design Decision 1 — the audit table above _is_ the deliverable

Per the owner-locked decision, this task's primary output is documentation, not code. The table is
written directly into this plan (not a separate `docs/stub-audit.md`) — TASK-267-A's acceptance
criteria are about the table's completeness/accuracy, and its "file to modify" is this plan
document itself. This mirrors how plan 122 (`content-map`) and other discovery-flavored plans in
this program (e.g. 097–102) treat the plan file as a first-class artifact, not just a
work-breakdown scratchpad.

### Design Decision 2 — honest-affordance fix for the two dead `#` social-link lists

Both `newsletter.tsx` and `blog-newsletter.tsx` are today plain (non-`"use client"`) Server
Components — no data fetching happens in either (`dict`-driven static content +
`NewsletterSubscribeForm`, which already manages its own client-side state internally). Neither
needs to become `async`; both need `"use client"` so their social-list items can carry an
`onClick`.

Rather than hardcoding "always render a stub button," the fix is **forward-compatible**: treat any
`social.href` that is falsy or the literal `"#"` as "not wired yet" and render a `toast` button;
render a real `<a>` the moment a real `href` is ever configured. This means the day the owner (or a
future task) fills in real channel URLs, the honest-affordance code does not need to be touched
again — it already knows how to render a working link:

```tsx
"use client";
import { toast } from "sonner";
// ...
{
  socials.map((social, i) => {
    const Icon = SOCIAL_ICONS[i];
    const isStub = !social.href || social.href === "#";
    return (
      <li key={social.label}>
        {isStub ? (
          <button
            type="button"
            onClick={() => toast(dict.home.newsletter.socialSoon)}
            className={sameClassNameAsAnchorToday + " cursor-pointer"}
          >
            <Icon className="size-5" aria-hidden="true" />
            {social.label}
          </button>
        ) : (
          <a
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            className={sameClassNameAsAnchorToday}
          >
            <Icon className="size-5" aria-hidden="true" />
            {social.label}
          </a>
        )}
      </li>
    );
  });
}
```

Identical structure applies to `blog-newsletter.tsx` (three channels, no Viber, its own
`className` string) with `dict.blog.newsletter.socialSoon`.

- The visual `className` string is copied byte-for-byte from the existing `<a>` (plus
  `cursor-pointer`, since a native `<button>` doesn't always default to a pointer cursor across
  browsers, matching the convention already used on other stub buttons in this codebase, e.g. the
  "forgot password" button in `login-form.tsx`) — **zero visual diff** for a user, only the click
  behavior changes.
- `dict.home.newsletter.socials` / `dict.blog.newsletter.socials` keep their existing `{ label,
href }` shape — `href: "#"` stays as the literal placeholder value in the dictionary (it is the
  signal the component reads to decide "stub or real"), only new `socialSoon` string keys are
  added alongside each `newsletter` block.
- This is a `"use client"` conversion for both widgets — confirmed safe: neither is `async`, and
  the only other export/import each uses (`NewsletterSubscribeForm`) is itself already a client
  component internally, so no server/client boundary is broken.

### API Contract

No changes. No new endpoint, no DTO, no Orval regeneration. `store-api` and `store-admin` are
untouched by this plan.

## Tasks

### TASK-267-A: Stub audit table

**Type:** docs
**Scope:** shared (audit spans `store-client`; documented here, not code)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] Audit table (this plan, §Technical Design) has one row per storefront stub found in
      `store-client`, each with: location (file + line range), what works today vs. what's
      missing, future BACKLOG task ID (or explicit "no dedicated task — reason"), and an explicit
      **KEEP** decision
- [ ] Every stub named in the original TASK-267 BACKLOG row is covered: cart add-ons (TASK-174),
      account loyalty/notifications (TASK-175), compare (TASK-085), quick-view (TASK-086), social
      login (TASK-168), social `#` links (F-18)
- [ ] Quick-view is explicitly noted as "not present — nothing to audit" rather than silently
      omitted (grounding confirmed zero quick-view UI exists anywhere in `store-client`)
- [ ] The footer's own (already-correct) social links are explicitly called out as **not** part of
      F-18/this audit, to prevent a future contributor re-flagging them as a stub
- [ ] Table distinguishes stubs needing **no** code change (already-honest toast/placeholder) from
      the two rows (9, 10) that get the Design Decision 2 fix in TASK-267-B
- [ ] No BACKLOG.md edit in this task (the orchestrating agent updates BACKLOG.md separately to
      avoid concurrent-write conflicts with plan 128)

**Files to create/modify:**

- `docs/plans/129-stub-audit.md` — this document (the audit table is the deliverable)

---

### TASK-267-B: Honest affordance for the dead `#` social-link lists (F-18)

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — a small, visually-identical UI swap, not cart/discounts/inventory/auth;
covered by new component tests per the acceptance criteria below.
**Depends on:** TASK-267-A (the audit is what identifies exactly these two rows as the only
code-change targets; sequencing them together in one plan makes that traceable, though this task's
diff does not literally require the table to exist first)

**Acceptance Criteria:**

- [ ] `widgets/newsletter/ui/newsletter.tsx` converted to `"use client"`; each social item with a
      falsy or `"#"` `href` renders as a `<button type="button" onClick={() =>
  toast(dict.home.newsletter.socialSoon)}>` instead of an `<a href="#">`; a social item with a
      real `href` (future-proofing) still renders as a real `<a target="_blank" rel="noopener
  noreferrer">`
- [ ] `widgets/blog/ui/blog-newsletter.tsx` gets the identical treatment with
      `dict.blog.newsletter.socialSoon`
- [ ] Both buttons are visually identical to today's anchors (same `className`, only + a
      `cursor-pointer` utility if not already implied); icon + label unchanged
- [ ] `dictionary.ts`: new `dict.home.newsletter.socialSoon` and `dict.blog.newsletter.socialSoon`
      string keys (UA copy, "скоро"-style, consistent tone with `dict.auth.login.socialSoon`)
- [ ] `newsletter.test.tsx` (new): clicking a social item calls `toast` (mocked via
      `jest.mock("sonner", () => ({ toast: jest.fn() }))`) with `dict.home.newsletter.socialSoon`,
      and the item renders with `role="button"` (not `role="link"`) — i.e. no dead anchor remains
      in the DOM
- [ ] `blog-newsletter.test.tsx` (new): same assertions for the blog variant
- [ ] Regression: `NewsletterSubscribeForm` (the actual email-capture form, unrelated to the social
      icons) in both widgets continues to render and function exactly as before — no unintended
      change to the subscribe flow
- [ ] `npm run build`/`lint`/`typecheck` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/newsletter/ui/newsletter.tsx` — `"use client"` + stub/real branch
- `apps/store-client/src/widgets/newsletter/ui/newsletter.test.tsx` — new
- `apps/store-client/src/widgets/blog/ui/blog-newsletter.tsx` — `"use client"` + stub/real branch
- `apps/store-client/src/widgets/blog/ui/blog-newsletter.test.tsx` — new
- `apps/store-client/src/shared/config/dictionary.ts` — `socialSoon` keys under
  `home.newsletter`/`blog.newsletter`

## Dependencies & Sequencing

- **Internal:** TASK-267-A → TASK-267-B is a soft/documentation-traceability dependency, not a
  hard code dependency — B's diff stands on its own even if read before A. Sequenced A-then-B
  anyway since the audit table is what justifies _why_ only rows 9–10 get a code change.
- **Shared worktree with TASK-184** (plan 128): both tasks are implemented together on branch
  `feature/184-267-nav-stub`, frontend-only, no API-contract change in either. Overlap is minimal:
  TASK-267-B touches `widgets/newsletter/`, `widgets/blog/ui/blog-newsletter.tsx`, and
  `dict.home.newsletter.*`/`dict.blog.newsletter.*`; TASK-184-B touches `widgets/footer/` and
  `dict.footer.*`. Disjoint files and disjoint dictionary sections — no line-level conflict
  expected. If both are edited in the same session, order doesn't matter for merge safety.
- **External:** None — every file this plan touches already exists on `develop`
  (`NewsletterSubscribeForm` shipped in TASK-188/TASK-237; `login-form.tsx`'s toast pattern shipped
  well before this plan).
- Closes UX-audit finding **F-18** (plan 103 §5/§6); **F-17** (the unrelated footer placeholder
  links, also reported alongside F-18) is TASK-184/plan 128, not this plan.
- Feeds nothing forward directly. When the owner eventually gets real social-channel URLs, the
  Design Decision 2 stub/real branch means filling in `dictionary.ts` `href` values is the entire
  follow-up diff — no component code needs to change again.

## Risks & Mitigations

| Risk                                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A future contributor reads "stub audit" and assumes the task is to hide/remove the listed stubs (the literal original BACKLOG wording said "hide-until-built (default)")                              | The owner-locked decision is stated explicitly and prominently at the top of this plan (Overview + Scope) — KEEP is the only decision made for every row; no hide/remove task exists anywhere in this plan                                                                                                                                |
| Converting `newsletter.tsx`/`blog-newsletter.tsx` to `"use client"` accidentally changes SSR behavior for the surrounding page (e.g. loses static-render eligibility for the homepage/blog list page) | Both widgets already import `NewsletterSubscribeForm`, which is itself a client component with its own client boundary — the parent page around these widgets was never purely static because of that nested client component; adding `"use client"` to the widget itself does not change what already required client-side JS to hydrate |
| The stub/real `href === "#"` branch silently keeps rendering a stub button forever if a future edit sets a real URL but forgets it must not be `"#"`                                                  | This is the existing signal already used by the dictionary today (`href: "#"` is the documented placeholder value, per the pre-existing code comments in both files) — not a new convention introduced by this plan, so the risk is pre-existing and unchanged, not created here                                                          |
| New `jest.mock("sonner", ...)` pattern has no precedent in this codebase (grounding confirmed zero existing tests mock `sonner`)                                                                      | Documented explicitly in TASK-267-B's acceptance criteria as the exact mock shape to use; this is a standard, low-risk Jest module mock (a single named export replaced with `jest.fn()`), not new test-harness plumbing                                                                                                                  |

## Notes

- This plan deliberately treats rows 9–10 (the two dead newsletter social-link lists) as the
  **only** actionable code change in the entire audit — every other row was already either
  correctly interactive (row 1), already carrying an honest stub note (rows 2–4, 14), already a
  working placeholder CTA (row 5), already an honest toast (rows 6, 8, 12, 13), simply not built
  yet with nothing to audit (row 7), or a content-configurable empty-fallback rather than a broken
  feature (row 11). This is the expected shape of a KEEP-everything audit: most rows require zero
  diff, and that is treated as a successful audit outcome, not an incomplete one.
- If the owner later decides some of these stubs (e.g. cart add-ons, loyalty) should actually be
  _hidden_ rather than kept visible-but-unpersisted, that is a new, explicitly-scoped follow-up
  task — not a re-interpretation of this plan, since the owner-locked decision here is unambiguous
  and was captured verbatim.
- The original BACKLOG row's phrase "hides as small commits" is superseded by the owner-locked
  decision; the two small commits this plan actually produces are honest-affordance commits, not
  hide commits.
