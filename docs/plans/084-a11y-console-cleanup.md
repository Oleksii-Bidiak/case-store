# Plan 084 — a11y / console-warning cleanup (TASK-138)

**Phase:** Phase 5 — Polish & Production (Tier 3 UX/data polish)
**Roadmap context:** Console hygiene, a11y correctness, operational visibility
**Branch:** fix/138-a11y-console-cleanup
**Created:** 2026-06-29
**Status:** To Do

---

## Problem Statement

Three separate console warnings / gaps are grouped under TASK-138 because they are all small,
independent, and touch separate files per workspace — no inter-task conflict:

1. **`aria-describedby` Radix warning** — Radix UI's `Dialog.Content` (used by both
   `SheetContent` and `DialogContent`) emits a dev-console warning when no accessible description
   is wired to the overlay. The mobile-menu `SheetContent` in `store-client/header.tsx` has a
   `SheetTitle` but no `SheetDescription`, triggering the warning every time the mobile menu opens.

2. **Link-preload browser warning** — Next.js preloads one or more font resources that the browser
   reports as "preloaded but not used within a few seconds." The exact resource cannot be confirmed
   without running the app; this task tracks the reproduce-then-fix flow.

3. **Mail disabled log at `debug` level** — `mail.service.ts:49` logs "Mail disabled — skipping…"
   via `logger.debug(...)`. Because Pino's default minimum level is `info`, this line is invisible
   in dev and staging. Manual QA teams need to see the confirmation that the skip actually happened.

---

## Root Cause Analysis

### RC-1: `SheetContent` call site in `header.tsx` missing `aria-describedby`

Radix UI `Dialog.Content` (which backs both `SheetContent` and `DialogContent` in the shadcn
pattern used here) emits a warning in development when the rendered content element has no
`aria-describedby` attribute AND no `Dialog.Description` child is present:

```
Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
```

The Radix resolution mechanism is context-based: `Dialog.Description` auto-generates an ID and
sets `aria-describedby` on the parent `Dialog.Content` via internal context. There is no fallback
for callers that omit the description.

**Affected call sites (confirmed by static analysis):**

| File                                                                              | Component                    | Description present?      | Warning? |
| --------------------------------------------------------------------------------- | ---------------------------- | ------------------------- | -------- |
| `store-client/src/widgets/header/ui/header.tsx:44`                                | `<SheetContent side="left">` | No (only `SheetTitle`)    | **Yes**  |
| `store-client/src/widgets/cart/ui/cart-summary.tsx:89`                            | `<DialogContent>`            | Yes (`DialogDescription`) | No       |
| `store-admin/src/features/product-image-manager/ui/product-image-manager.tsx:252` | `<DialogContent>`            | Yes (`DialogDescription`) | No       |

Store-admin has no call site for `SheetContent` at all (exported but unused). All existing
`DialogContent` call sites already include `DialogDescription` — the Dialog warning is latent only
and covered by the JSDoc documentation sub-task.

**Why NOT fix at the primitive level (`sheet.tsx`, `dialog.tsx`):**
Adding `aria-describedby={undefined}` as a default on `SheetPrimitive.Content` /
`DialogPrimitive.Content` inside the primitive wrapper would permanently suppress the warning for
ALL uses, including future ones that legitimately should have a description. It would also override
Radix's auto-wiring: when a `Dialog.Description` IS rendered, Radix sets `aria-describedby` via
context; forcing `undefined` at the primitive level removes that link for screen readers. The only
safe site for the `aria-describedby={undefined}` flag is the specific call site where the author
consciously chooses to have no description.

**Chosen approach:** Add `aria-describedby={undefined}` to the one triggering call site
(`header.tsx`) and add a JSDoc paragraph to both apps' `sheet.tsx` and `dialog.tsx` documenting the
convention, so the next developer who adds a Sheet/Dialog without a description knows what to do.

### RC-2: Link-preload warning — cannot confirm root cause from static analysis

`store-client/src/app/layout.tsx` loads three Google fonts (`Geist`, `Geist_Mono`, `Sora`).
Next.js generates `<link rel="preload">` for each font file. The most likely trigger is:

- **`Sora`** (weights 600/700/800) preloaded in the root layout but only used in display headings.
  If the initial render does not include a Sora-weighted heading (e.g., on a sparse page or during
  hydration), the browser fires the warning before the font is consumed.
- **`Geist_Mono`** preloaded globally but potentially unused on pages with no monospace text.

However, this depends on route, timing, browser throttling, and the font-subsetting CDN response
— none of which can be confirmed from static analysis. This sub-task is therefore framed as
**reproduce-then-fix**: open DevTools → Console → reproduce the warning → identify the exact
resource URL → trace back to the font declaration or `<Image priority>` responsible → apply the
minimal fix (add `display: optional`, remove the font from the root layout if unused on most routes,
or audit for any `priority` `next/image` that never renders).

### RC-3: `logger.debug(...)` is invisible at default Pino log level

`nestjs-pino`'s `PinoLogger` maps `logger.log(msg)` → Pino `info` and `logger.debug(msg)` → Pino
`debug`. The `LOG_LEVEL` env var defaults to `info`, so `debug` messages are suppressed in dev,
staging, and production unless explicitly lowered.

`MailService.sendOrderConfirmation` is the only method in `mail.service.ts` with a `!this.enabled`
guard. There is no second send path. Changing that single call from `this.logger.debug(...)` to
`this.logger.log(...)` covers the entire mail-disabled surface area.

---

## Tasks

### TASK-138-A: Fix `aria-describedby` warning — call site + JSDoc in primitives

**Type:** fix
**Scope:** store-client + store-admin (primitive files) + store-client (call site)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** nothing (independent)

**Acceptance Criteria:**

- [ ] `header.tsx` `SheetContent` receives `aria-describedby={undefined}`:
      opening the mobile menu in a browser dev-tools console no longer shows the Radix
      `Missing Description` warning
- [ ] `store-client/src/shared/ui/sheet.tsx` `SheetContent` JSDoc updated with a note explaining:
      "When no `SheetDescription` is rendered, pass `aria-describedby={undefined}` on this
      component to suppress the Radix warning. Do NOT add a default `aria-describedby` inside this
      component — it would override Radix's auto-linking for calls that DO have a description."
- [ ] `store-client/src/shared/ui/dialog.tsx` `DialogContent` receives same JSDoc note
- [ ] `store-admin/src/shared/ui/sheet.tsx` `SheetContent` receives same JSDoc note
- [ ] `store-admin/src/shared/ui/dialog.tsx` `DialogContent` receives same JSDoc note
- [ ] `cart-summary.tsx` and `product-image-manager.tsx` remain untouched (already have
      `DialogDescription` — no warning there)
- [ ] Typecheck + lint pass: `npm run typecheck && npm run lint -w apps/store-client`
- [ ] Typecheck + lint pass: `npm run typecheck && npm run lint -w apps/store-admin`
- [ ] Tests pass: `npm run test -w apps/store-client` (existing 120+ tests unaffected)
- [ ] Tests pass: `npm run test -w apps/store-admin` (existing 52+ tests unaffected)

**A11y verification:**
In `jsdom`/RTL you cannot observe the Radix warning. Manual verification: open the storefront in a
browser, click the mobile-menu hamburger, check the DevTools Console — the warning must be absent.
For automated coverage: the existing `Header` component tests can assert that `SheetContent` renders
(the import itself will fail TS if `aria-describedby` is the wrong type), and the a11y change is
verified to be a no-op for the DOM (the `aria-describedby` attribute is simply omitted, which is
what `undefined` does in React JSX).

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header.tsx` — add `aria-describedby={undefined}` to
  `SheetContent` at line 44
- `apps/store-client/src/shared/ui/sheet.tsx` — JSDoc on `SheetContent` function
- `apps/store-client/src/shared/ui/dialog.tsx` — JSDoc on `DialogContent` function
- `apps/store-admin/src/shared/ui/sheet.tsx` — JSDoc on `SheetContent` function
- `apps/store-admin/src/shared/ui/dialog.tsx` — JSDoc on `DialogContent` function

---

### TASK-138-B: Mail disabled — promote log from `debug` to `log` (`info`)

**Type:** fix
**Scope:** store-api
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** nothing (independent)

**Acceptance Criteria:**

- [ ] `mail.service.ts` line 49: `this.logger.debug(...)` changed to `this.logger.log(...)`
- [ ] The log message text is preserved verbatim:
      `"Mail disabled — skipping order confirmation to ${params.to}"`
- [ ] `MailService` unit test (if exists) updated to assert `log` (not `debug`) is called when
      `MAIL_ENABLED` is not `"true"`; or a new unit test is added verifying this call
- [ ] With `LOG_LEVEL=info` (the default), starting the API with `MAIL_ENABLED` unset and then
      triggering `sendOrderConfirmation` prints the skip line in the terminal (manual verification)
- [ ] No other `sendOrderConfirmation` paths exist that also need the level change (confirmed:
      `sendOrderConfirmation` is the only public method; there is no second send path)
- [ ] Typecheck + lint + build pass: `npm run typecheck && npm run lint && npm run build -w apps/store-api`
- [ ] Tests pass: `npm run test -w apps/store-api` (all 436+ unit tests green)

**Files to create/modify:**

- `apps/store-api/src/mail/mail.service.ts` — change `logger.debug` → `logger.log` on line 49
- `apps/store-api/src/mail/mail.service.spec.ts` (or equivalent test file) — update or add
  assertion on log level; create the spec file if one does not exist

---

### TASK-138-C: Link-preload warning — reproduce-then-fix (best-effort)

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h) — if root cause confirmed; otherwise documents finding only
**TDD Required:** No
**Depends on:** nothing (can investigate in parallel)

**Context and approach:**

This warning (`<link rel=preload> was preloaded using link preload but not used within a few
seconds`) is emitted by the browser, not by application code. It cannot be reproduced from static
analysis alone. The most likely candidate in this project is one of the three `next/font/google`
declarations in `store-client/src/app/layout.tsx`:

- `Geist` (body) — used globally, unlikely to warn
- `Geist_Mono` (mono variant) — used globally but may not appear in any element on most routes
- `Sora` (display, weights 600/700/800) — loaded in the root layout but only applied to headings;
  if the first route rendered by the browser has no Sora-weighted heading before the preload timeout
  fires (typically ~3 s), the warning appears

The fix depends on which resource is named in the warning. Possible resolutions:

| Cause                                                                | Resolution                                                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Geist_Mono` never used on most pages                                | Move to a sub-layout or lazy-load; or add `display: 'swap'` and accept FOUT                                                                                 |
| `Sora` loaded eagerly for all routes but only needed on select pages | Add `display: 'optional'` to the `Sora` font declaration (browser preloads optimistically but won't block render; reduces the chance of the warning firing) |
| A `next/image priority` image that never renders on a given route    | Remove `priority` from that `<Image>`                                                                                                                       |
| An explicit `<link rel="preload">` somewhere in the JSX              | Remove or move it                                                                                                                                           |

**Acceptance Criteria:**

- [ ] On a running stack (local or staging), the browser DevTools Console does not show
      `preloaded but not used` for any font or image on the home page, product-list page, and
      product-detail page
- [ ] If the root cause is `Sora` or `Geist_Mono`, the chosen fix (e.g., `display: 'optional'`)
      is documented with rationale in a JSDoc comment above the font declaration
- [ ] Typecheck + lint + build pass: `npm run typecheck && npm run lint && npm run build -w apps/store-client`
- [ ] **If the warning cannot be reproduced in the available environment**, this sub-task is
      marked with a note in the plan ("not reproducible in current environment") and closed as
      best-effort; it does not block TASK-138 completion

**Files to create/modify (if root cause confirmed):**

- `apps/store-client/src/app/layout.tsx` — adjust font declaration(s) (most likely `Sora`
  `display: 'optional'` or `Geist_Mono` removal/scoping)

---

## Execution order

```
TASK-138-A  (store-client header + 4 primitive files — independent)
TASK-138-B  (store-api mail.service.ts — independent)
TASK-138-C  (store-client layout fonts — independent, best-effort, can run in parallel)
```

All three sub-tasks are independent and touch separate files across separate workspaces. They can
be executed in any order or in parallel on the same branch `fix/138-a11y-console-cleanup`.

---

## Verification commands

```bash
# store-client
npm run typecheck -w apps/store-client
npm run lint -w apps/store-client
npm run test -w apps/store-client
npm run build -w apps/store-client

# store-admin
npm run typecheck -w apps/store-admin
npm run lint -w apps/store-admin
npm run test -w apps/store-admin

# store-api
npm run typecheck -w apps/store-api
npm run lint -w apps/store-api
npm run test -w apps/store-api
npm run build -w apps/store-api
```

---

## Pending manual QA (post-ship)

| Check                                                                                                                                                                  | How                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mobile-menu Sheet: no Radix `Missing Description` warning in console                                                                                                   | Open storefront on mobile viewport, click hamburger, watch DevTools Console |
| Mail skip line visible: with `MAIL_ENABLED` unset, trigger an order confirmation, confirm `[INFO] MailService — Mail disabled — skipping…` appears in the API terminal | `LOG_LEVEL=info` (default), trigger `POST /api/orders` on a running stack   |
| Link-preload: no `preloaded but not used` in DevTools Console on home / products / PDP routes                                                                          | Browser DevTools → Console → filter "preload", navigate through storefront  |

---

## Completion checklist

- [ ] TASK-138-A: `header.tsx` call site fixed; JSDoc added to all four primitive files; tests green
- [ ] TASK-138-B: `mail.service.ts` log level changed; test updated; api build/lint/test green
- [ ] TASK-138-C: link-preload reproduced and fixed, OR documented as not reproducible (best-effort)
- [ ] `BACKLOG.md` updated: TASK-138 → ✅, plan link added
