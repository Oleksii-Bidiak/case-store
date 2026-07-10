# Plan 141 — ESLint rule against arbitrary Tailwind values (TASK-260)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 5 (Адаптив/дизайн + прев'ю контенту + хвости)
> **Origin:** `docs/plans/103-storefront-ux-audit.md` (TASK-225) finding F-21; deferred out of
> plan 139 (`§Out of Scope`: "TASK-260 adds a lint rule right after this merges")
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG task:** TASK-260
> **Worktree:** `feature/141-eslint-tailwind` — single build agent, sequential tasks in one branch.

## Overview

F-21 flagged Tailwind "arbitrary value" classnames (`text-[13.5px]`, `rounded-[18px]`,
`shadow-[var(--shadow-card)]`, …) bypassing the design-token scale. The BACKLOG row's "242
`text-[Npx]`-style entries in 61 files" undercounts the real footprint — it only measured the
`text-[…]` category. A fresh sweep of `develop` (post Wave-5 merge) with
`grep -rEo '[a-zA-Z-]+-\[[^][]*\]' apps/*/src --include=*.tsx --include=*.ts`, filtered to exclude
arbitrary **variants** (selectors like `data-[state=open]:`, `has-[…]:`, `group-data-[…]:`,
`supports-[…]:` — a different, legitimate Tailwind mechanism not in scope for this rule), finds:

| Workspace      | Arbitrary-**value** occurrences | Files touched                                               |
| -------------- | ------------------------------- | ----------------------------------------------------------- |
| `store-client` | 994                             | 112                                                         |
| `store-admin`  | 76                              | 34                                                          |
| **Total**      | **1070**                        | **~140** (unique files, small overlap none — separate apps) |

`text-[…]` alone is 248 occurrences (close to the stale "242") — the other ~820 are spread across
`rounded-` (101), `shadow-` (80), `size-` (69), `max-w-` (63+20=83), `h-` (47+2), `leading-` (43+4),
`gap-` (41), `border-` (38), `mb-` (36+4), `tracking-` (31+1), `p-` (30), `w-` (26+1),
`grid-cols-` (19+1), `ring-` (14+8), and a long tail of one-off spacing/position utilities. Given
this scale, "reduce existing to the scale" cannot mean a full remediation pass in one Light task —
this plan scopes it to (a) a hard **new-value** guard (the task's real must-have) plus (b) a
bounded, zero-visual-risk mechanical cleanup of the cases that map exactly onto **already-declared**
theme tokens.

**Key finding that shapes the design:** `apps/store-client/src/app/globals.css` and
`apps/store-admin/src/app/globals.css` already declare `--shadow-card` / `--shadow-elevated` /
`--shadow-lift` inside `@theme inline` (i.e. `shadow-card`/`shadow-elevated`/`shadow-lift`
utilities already exist and render pixel-identical CSS) — yet the codebase still writes
`shadow-[var(--shadow-card)]` etc. 80 times (57 + 17 + 5 + 1 `shadow-[inset_…]` one-off) instead of
the plain utility. That's a free, zero-risk, mechanical win covering ~7.5% of the whole backlog by
itself. `rounded-[10px]` (15 occurrences, store-client) is numerically identical to the existing
`rounded-md` (`--radius-md: calc(var(--radius) - 2px)` = 10px) — another exact, safe rename.

## Scope

### In Scope

1. **New-value guard.** Add `eslint-plugin-tailwindcss`'s `no-arbitrary-value` rule as `error` in
   both `store-client` and `store-admin`'s flat ESLint configs, scoped narrowly (this rule only —
   not the plugin's full `recommended` preset, to avoid unrelated scope creep from
   `no-custom-classname`/`classnames-order`/etc.).
2. **Baseline via ESLint's built-in suppressions mechanism** (`eslint --suppress-rule
tailwindcss/no-arbitrary-value`, ESLint ≥9.39 already installed here) so the rule can go live as
   `error` today without a one-shot fix of all ~1070 existing occurrences — new violations still
   fail immediately; existing ones are grandfathered into a committed `eslint-suppressions.json`
   per workspace and shrink opportunistically over time as files are touched.
3. **Explicit, reviewed exceptions** (small, curated list, ~15-25 sites) for classnames that are
   structurally necessary and permanent — not "debt" — pulled out of the suppressions file and
   given an inline `// eslint-disable-next-line tailwindcss/no-arbitrary-value -- <reason>` instead:
   sidebar/two-column `grid-cols-[…]` layouts (e.g. `grid-cols-[264px_1fr]`,
   `grid-cols-[minmax(0,1fr)_360px]` in `banner-form.tsx`), `content-['']` pseudo-element markers,
   `content-[attr(data-label)]` mobile-card table labels in `store-admin/shared/ui/table.tsx`.
4. **Opportunistic reduction — mechanical, zero-visual-diff only:** rename every
   `shadow-[var(--shadow-card)]` / `-elevated` / `-lift` → `shadow-card` / `shadow-elevated` /
   `shadow-lift`, and every `rounded-[10px]` → `rounded-md`, in both workspaces. These are the only
   two categories where a bracket value is numerically/referentially identical to an existing
   theme token today — everything else is left for future opportunistic touches (see Out of Scope).
5. Regenerate/prune the suppressions files after steps 3-4 so they reflect the reduced count.
6. `npm run lint` clean on both workspaces (root `npm run lint` included).

### Out of Scope

- Full remediation of the remaining ~975 pre-existing arbitrary values (typography scale
  `text-[…]`/`leading-[…]`/`tracking-[…]` trios, one-off spacing/position values, `max-w-[8rem]`
  ×15 in `store-admin`, etc.). These stay covered by the suppressions baseline as tracked debt;
  fixing them requires either a new matching `@theme` token (a design decision, not a mechanical
  rename) or case-by-case scale substitution that risks visual drift — both out of a Light task's
  budget. A future pass can shrink the suppressions file incrementally.
- Designing a unified custom typography scale (e.g. promoting the repeated `text-[13.5px]` /
  `text-[12.5px]` / `text-[14.5px]` trio-with-`leading`/`tracking` combos into named `@theme`
  tokens). This is a real opportunity (the single biggest lever, ~320 occurrences) but is a design
  decision needing owner sign-off on whether these fine-grained sizes are intentional per-component
  tuning or should consolidate — flagged as a candidate follow-up, not attempted here.
- `eslint-plugin-tailwindcss`'s other rules (`classnames-order`, `no-custom-classname`,
  `no-contradicting-classname`, `enforces-shorthand`, `enforces-negative-arbitrary-values`,
  `no-unnecessary-arbitrary-value`) — each would need its own review pass; only `no-arbitrary-value`
  is enabled here, matching F-21's exact scope.
- `apps/store-api` — Tailwind/JSX doesn't apply there.

## User Stories

1. As a developer adding a new component, I want the linter to reject a new
   `className="w-[137px]"`-style value immediately (locally and in CI), so ad hoc pixel values stop
   accumulating and I'm nudged toward the existing spacing/sizing scale or a proper `@theme` token.
2. As a reviewer, I want a small, explicit, commented list of the handful of classnames where an
   arbitrary value is genuinely unavoidable (asymmetric sidebar grids, empty-content pseudo-elements,
   `attr()`-driven mobile table labels), so PRs aren't blocked on legitimate Tailwind escape hatches.
3. As a maintainer, I want the pre-existing ~1000 arbitrary values to not block adoption of the rule
   today, and to see the debt shrink naturally as files are touched for other work, rather than
   requiring a giant one-shot cleanup PR.

## Technical Design

### Mechanism decision: `eslint-plugin-tailwindcss` (not a hand-rolled `no-restricted-syntax` rule)

Verified against this repo's exact stack (`npm registry` + a live install check):

- `eslint-plugin-tailwindcss@4.1.0` peer-deps `"eslint": "^9.0.0 || ^10.0.0"`,
  `"tailwindcss": "^4.0.0"` — matches this monorepo's `eslint@^9` / `tailwindcss@^4` exactly. It is
  explicitly built for Tailwind v4's CSS-based `@theme` config (no v3 JS-config support needed).
- Its `no-arbitrary-value` rule parses classnames via Tailwind's own utility grammar (the plugin
  depends on `tailwind-api-utils`), so it correctly tells arbitrary **values** (`w-[20rem]`) apart
  from arbitrary **variants** (`data-[state=open]:…`, `has-[…]:…`, `[&_svg]:…`) — the same
  distinction this plan's grep survey had to hand-filter for. A bespoke `no-restricted-syntax` rule
  would have to re-implement that grammar (bracket-after-dash-following-a-known-utility vs.
  bracket-as-a-selector) with regex, which is exactly the kind of subtly-wrong string matching this
  codebase should avoid reinventing.
- Default `settings.tailwindcss.functions` already includes `"cn"` (this codebase's `cn()` helper
  in both `shared/lib/utils.ts` files, the shadcn convention) — classnames inside `cn(...)` calls
  are scanned out of the box, no extra `functions`/`callees` config needed.
- The only **mandatory** setting is `cssConfigPath` (must point at each workspace's own
  `src/app/globals.css`, since Tailwind v4 config lives in CSS, not a JS file) — this is why the
  rule is configured **per app**, not centrally in `packages/eslint-config`.
- The rule has **no built-in allowlist/exceptions option** ("There are no specific options for this
  rule" — confirmed against the published rule docs), which is exactly why the suppressions
  mechanism (below) carries the bulk of the existing-debt problem, and inline
  `eslint-disable-next-line` comments carry the small curated "permanent, justified" list.

### New-value guard: config shape (per app)

`apps/store-client/eslint.config.mjs` and `apps/store-admin/eslint.config.mjs` (both currently
`...nextVitals, ...nextTs, ...fsdBoundaryRules, ...testOverrides, globalIgnores([…])`, see current
file) get one more config object appended, **not** using `extends: [tailwindcss.configs.recommended]`
(that preset also turns on `no-contradicting-classname` as an error and several other unrelated
warn-level rules — out of scope and a real risk of unrelated false positives on top of the already
committed layout patterns like `hidden sm:block`):

```js
import tailwindcss from 'eslint-plugin-tailwindcss';
// …
{
  plugins: { tailwindcss },
  settings: {
    tailwindcss: {
      cssConfigPath: './src/app/globals.css',
    },
  },
  rules: {
    'tailwindcss/no-arbitrary-value': 'error',
  },
},
```

Add `eslint-plugin-tailwindcss` as a devDependency of each app (`apps/store-client/package.json`,
`apps/store-admin/package.json`) — not `packages/eslint-config`, since the mandatory
`cssConfigPath` differs per app and the shared package has no clean way to parameterize it without
becoming a factory export; a small duplicated config block in two files is preferable to that
indirection for a single rule. If the manual `plugins: { tailwindcss }` registration turns out not
to match the package's actual flat-config export shape at implementation time, the fallback is
`extends: [tailwindcss.configs.recommended]` plus explicitly setting every other exported
`tailwindcss/*` rule to `'off'` next to the one line that matters
(`'tailwindcss/no-arbitrary-value': 'error'`) — functionally equivalent, slightly more verbose.

### Baseline: ESLint suppressions (verified locally against the installed `eslint@9.39.4`)

Empirically confirmed against the exact installed version in this repo (throwaway sandbox test,
not just docs): once an `eslint-suppressions.json` file exists in a workspace's cwd, a **plain**
`eslint` invocation (the existing `npm run lint` script, no new flags) automatically reads it and:

- passes silently for every pre-recorded (file, rule, count) triple,
- **fails** the moment a new violation appears anywhere (new file, or an existing file's count
  exceeding what's recorded) — this is the "block new arbitrary values" behavior the task needs,
- prints a non-blocking informational note ("There are suppressions left that do not occur
  anymore…") when a previously-suppressed violation is fixed, prompting a `--prune-suppressions`
  pass — exactly the "shrinks opportunistically" ratchet the BACKLOG description asks for.

Rollout, run from each app's directory:

```bash
# after adding the rule config above, and after the curated exceptions (below) are
# already converted to eslint-disable-next-line comments (so they're excluded from the baseline):
npx eslint . --suppress-rule tailwindcss/no-arbitrary-value
git add eslint-suppressions.json
```

Commit the generated `eslint-suppressions.json` in each of `apps/store-client/` and
`apps/store-admin/` (not gitignored — verified no existing `.gitignore` rule would exclude it).
`npm run lint` (root and per-workspace) needs no changes — it already just runs `eslint` with cwd
set to the workspace by npm's `-w` mechanism, which is exactly where the suppressions files live.

### Curated permanent exceptions (excluded from the suppressions baseline)

These are structurally necessary uses of Tailwind's arbitrary-value escape hatch, not debt — give
each an inline disable comment with a one-line reason instead of letting the suppressions file
paper over them silently:

| Pattern                                                                                  | Sites (approx.)                                                                                                                                                                                                                                                                                                                                                         | Reason                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grid-cols-[<fixed>_1fr]` / `grid-cols-[minmax(...)…]` two-column sidebar/detail layouts | ~15-18 (`account-view.tsx`, `categories-view.tsx` ×2, `legal-doc-view.tsx`, `info-view.tsx`, `product-list-view.tsx`, `wishlist-view.tsx`, `product-detail-view.tsx` + skeleton, `cart-view.tsx`, `checkout-view.tsx`, `contact-view.tsx`, `footer.tsx`, `hero-banner.tsx`, `blog-article-view.tsx`, `blog-featured-card.tsx`, `promo-deals.tsx` ×2, `banner-form.tsx`) | Exact fixed-px + fluid-fr column layouts have no equivalent in Tailwind's named `grid-cols-N` scale; this is Tailwind's own documented use case for arbitrary `grid-template-columns` |
| `content-['']`                                                                           | 3 (`product-card.tsx`, `hero-slider.tsx`, `wishlist-item-card.tsx`)                                                                                                                                                                                                                                                                                                     | Tailwind requires an explicit `content` value for `before:`/`after:` pseudo-elements; empty-string is the only correct value for a decorative marker, there is no "scale" for it      |
| `content-[attr(data-label)]`                                                             | 2-3 (`store-admin/shared/ui/table.tsx`, its `.test.tsx`)                                                                                                                                                                                                                                                                                                                | Mobile card-view CSS trick injecting the column header via `attr()`; not expressible without an arbitrary value                                                                       |
| `shadow-[inset_0_-2px_0_0_var(--color-primary)]`                                         | 1                                                                                                                                                                                                                                                                                                                                                                       | One-off inset shadow, not a reusable elevation token                                                                                                                                  |

Build agent double-checks this list against the live grep at implementation time (Wave-5 merges are
already in; small drift possible from unrelated work landing between this plan and implementation)
and extends it if another clearly-structural case turns up — keep the list short and each entry
individually justified in its own disable comment, not a blanket file-level disable.

### Opportunistic reduction (mechanical, zero visual diff)

1. `shadow-[var(--shadow-card)]` → `shadow-card`, `shadow-[var(--shadow-elevated)]` →
   `shadow-elevated`, `shadow-[var(--shadow-lift)]` → `shadow-lift` — global find/replace across
   both workspaces (80 sites total: 57+17+5 in `store-client`, plus check `store-admin` for any).
   Verify: these three utilities already resolve to the identical `var(--shadow-*)` value via
   `@theme inline` in both `globals.css` files (confirmed in this plan's investigation) — the
   generated CSS is byte-identical before/after, so no visual regression is possible.
2. `rounded-[10px]` → `rounded-md` (15 sites, `store-client`) — `--radius-md: calc(var(--radius) -
2px)` with `--radius: 0.75rem` (12px) computes to exactly 10px; identical output.
3. Re-run `--suppress-rule tailwindcss/no-arbitrary-value` (or `--prune-suppressions`) after 1-2 so
   the committed suppressions files shrink to reflect the ~95 fewer occurrences.
4. Do **not** attempt broader numeric-scale substitution (e.g. `text-[13px]` → `text-sm` at 14px) —
   that changes rendered output and is a design call, not a mechanical rename; leave it to the
   suppressions baseline.

## Tasks

### TASK-260-A: Install + configure `no-arbitrary-value` guard in both workspaces

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `eslint-plugin-tailwindcss` added as a devDependency in `apps/store-client/package.json` and
      `apps/store-admin/package.json` (version compatible with `eslint@^9`, `tailwindcss@^4` —
      `^4.1.0` per this plan's investigation).
- [ ] Both `eslint.config.mjs` files register the plugin and enable
      `'tailwindcss/no-arbitrary-value': 'error'` only (no other `tailwindcss/*` rule enabled),
      with `settings.tailwindcss.cssConfigPath` pointing at that workspace's own
      `src/app/globals.css`.
- [ ] Smoke test (manual, not committed): temporarily add `className="w-[137px]"` to any component,
      confirm `npm run lint -w apps/<app>` fails on it; remove the test change.
- [ ] `npm run lint -w apps/store-client` / `-w apps/store-admin` still runs (will still report the
      full pre-existing backlog at this point — expected, resolved by TASK-260-B).

**Files to create/modify:**

- `apps/store-client/package.json`
- `apps/store-client/eslint.config.mjs`
- `apps/store-admin/package.json`
- `apps/store-admin/eslint.config.mjs`

---

### TASK-260-B: Curated exceptions + opportunistic reduction

**Type:** refactor
**Scope:** store-client, store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-260-A

**Acceptance Criteria:**

- [ ] Every site in this plan's "Curated permanent exceptions" table (re-verified against current
      `develop`, list extended if warranted) gets an inline
      `// eslint-disable-next-line tailwindcss/no-arbitrary-value -- <one-line reason>` immediately
      above the JSX line (or `{/* eslint-disable-next-line … */}` where the classname is on its own
      line inside JSX) — no blanket file-level or block-level disables.
- [ ] All `shadow-[var(--shadow-card)]` / `-elevated` / `-lift` occurrences in both workspaces are
      replaced with `shadow-card` / `shadow-elevated` / `shadow-lift` (grep-verifiable: zero
      remaining `shadow-\[var\(--shadow-` matches in `apps/store-client/src` and
      `apps/store-admin/src`).
- [ ] All `rounded-[10px]` occurrences in `store-client` are replaced with `rounded-md`
      (grep-verifiable: zero remaining `rounded-\[10px\]` matches).
- [ ] Visual spot-check (manual, not automated): a handful of touched pages/components
      (`ProductCard`, `Button`/card shadow usage, one page using the sidebar grid layout) render
      pixel-identical before/after — flagged in `manual-qa-pending.md` per this codebase's
      convention for changes that can't be asserted by an automated test.
- [ ] `npm run test -w apps/store-client -- --runInBand` and `-w apps/store-admin` stay green (no
      RTL test asserts the old `shadow-[…]`/`rounded-[10px]` class strings verbatim; if one does,
      update it to the new class name).
- [ ] `npm run lint -w apps/store-client` / `-w apps/store-admin` still fails at this point on the
      remaining (non-exempted, non-reduced) pre-existing arbitrary values — expected, resolved by
      TASK-260-C.

**Files to create/modify:**

- The files listed in the "Curated permanent exceptions" table (build-agent-verified exact list)
- All files matching `shadow-\[var\(--shadow-` / `rounded-\[10px\]` in
  `apps/store-client/src`, `apps/store-admin/src`
- `docs/manual-qa-pending.md` — new `## TASK-260` section

---

### TASK-260-C: Generate and commit the suppressions baseline

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-260-B

**Acceptance Criteria:**

- [ ] `npx eslint . --suppress-rule tailwindcss/no-arbitrary-value` run from each app's directory
      generates `eslint-suppressions.json`, covering exactly the remaining (non-exempted) arbitrary
      values after TASK-260-B's reduction — committed to git in both `apps/store-client/` and
      `apps/store-admin/`.
- [ ] `npm run lint` (root, and both `-w apps/store-client` / `-w apps/store-admin`) passes clean —
      full verification that the baseline covers 100% of the remaining pre-existing violations and
      the plugin/rule config from TASK-260-A is wired correctly.
- [ ] Re-run the TASK-260-A smoke test (temporary new `w-[137px]`-style className) one more time
      end-to-end: confirms it still fails lint even with the suppressions file present (new
      violations are never grandfathered in) — remove the test change after confirming.
- [ ] A short note (this plan's Notes section, already covers it — no new doc needed) explains the
      suppressions file's purpose and the `--prune-suppressions` maintenance command for future
      readers who encounter it in a `git blame`/PR diff.
- [ ] CI's existing `lint` job (`.github/workflows/ci.yml` → `npm run lint`) passes unmodified — no
      workflow file changes needed, since suppressions are auto-read by a plain `eslint` invocation.

**Files to create/modify:**

- `apps/store-client/eslint-suppressions.json` — new
- `apps/store-admin/eslint-suppressions.json` — new

## Migration Steps

1. TASK-260-A — add the plugin + rule config to both workspaces (rule now fails on the full
   pre-existing backlog, expected at this point).
2. TASK-260-B — carve out curated exceptions (inline disables) and apply the two mechanical
   renames (`shadow-*`, `rounded-md`); re-verify with tests.
3. TASK-260-C — generate + commit the suppressions baseline per workspace; full lint suite green;
   confirm the new-violation smoke test still fails as expected.
4. Full-suite verification (`npm run lint`, `npm run typecheck`, `npm run test -- --runInBand` in
   both frontend workspaces) before handing the branch back for review/merge.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-tailwindcss`'s manual `plugins: { tailwindcss }` flat-config registration might not exactly match the package's exported shape (unverified against the literal `.d.cts` in this pass)                                                    | Documented fallback in Technical Design: `extends: [tailwindcss.configs.recommended]` + explicitly `'off'` on every rule except `no-arbitrary-value` — functionally identical, slightly more verbose, guaranteed to match the documented usage pattern                          |
| Suppressions ratchet is file+rule **count**-based, not line-based — fixing one violation and introducing an unrelated new one in the _same file_ without changing the total count would silently pass                                                   | Acceptable trade-off for a Light task: still catches the overwhelmingly common case (any new file, or any file whose count increases); flagged here so a future reader isn't surprised by this specific edge case rather than assuming line-level precision                     |
| The curated "permanent exception" list (grid layouts, `content-['']`) may miss a site, or a new structurally-necessary case may exist that this plan's investigation didn't surface                                                                     | Build agent re-greps at implementation time (`develop` may have drifted slightly since this plan was written) and extends the list; any missed case simply stays in the suppressions baseline instead of getting an inline comment — not a lint failure either way              |
| `shadow-[var(--shadow-card)]` → `shadow-card` rename touches ~80 sites across many widgets — a mechanical sed/grep-replace risks a stray mismatch (e.g. a site using a slightly different `var(--shadow-...)` expression this plan didn't account for)  | Grep-verify zero remaining `shadow-\[var\(--shadow-` matches as an explicit acceptance criterion catches any missed or malformed replacement; RTL test suite is a regression backstop                                                                                           |
| Full `npm run lint` at root chains `store-api` → `store-client` → `store-admin`; if `store-api`'s lint state on `develop` is not already clean, TASK-260-C's "root `npm run lint` passes clean" criterion could fail for reasons unrelated to this plan | Scope that criterion to the two frontend workspaces explicitly in the acceptance criteria (already done above); if root lint is flagged red by pre-existing `store-api` issues, that's a separate, out-of-scope finding to report, not a blocker for this plan's own workspaces |

## Notes

- **Why `eslint-plugin-tailwindcss` over a hand-rolled `no-restricted-syntax` rule.** The deciding
  factor is correctness of the arbitrary-value/arbitrary-variant distinction (verified: `data-`/
  `has-`/`group-data-`/`supports-` bracket usage — 183 of the raw 1253 regex hits in this plan's
  survey — are variants, not values, and must not be flagged). The plugin gets this right via
  Tailwind's own class grammar; a bespoke regex-based rule would need to reimplement that grammar
  and would be a maintenance burden disproportionate to a Light task, for a plugin that already
  matches this repo's exact `eslint@^9`/`tailwindcss@^4` versions with zero compatibility risk.
- **Why suppressions over a config allowlist.** The plugin's `no-arbitrary-value` rule has no
  allowlist option at all (confirmed against its published docs) — so the only two mechanisms
  available are ESLint's own suppressions file (bulk, for "not worth fixing today" debt) and inline
  `eslint-disable-next-line` (individual, for "this is correct forever" cases). This plan uses both,
  matching the BACKLOG's own two-part framing ("blocking new arbitrary values" = the rule +
  suppressions ratchet; "existing reduced to the scale opportunistically" = the two mechanical
  renames now, and future incremental shrinkage of the suppressions file as files are touched later).
- **Suppressions mechanism verified empirically**, not just from docs — a throwaway sandbox test
  against the exact installed `eslint@9.39.4` in this repo confirmed: (1) a plain `eslint` run
  auto-reads `eslint-suppressions.json` with no extra flags, (2) a brand-new violation anywhere
  still fails immediately, (3) fixing a suppressed violation passes with a non-blocking
  "consider `--prune-suppressions`" note. This de-risks the core mechanism this plan is built on.
- **`docs/manual-qa-pending.md`.** Per TASK-260-B, the implementing agent appends a `## TASK-260`
  section (Ukrainian, following the file's existing "Зроби: / Має бути:" format) flagging the
  visual spot-check for the `shadow-*`/`rounded-md` renames — expected to be a very short section
  since both renames are provably CSS-output-identical, included mainly as this codebase's standard
  practice for any class-name change touching visible surfaces.
- **`BACKLOG.md`.** Not edited by this planning pass — the orchestrator updates task status and the
  plan-reference column.
