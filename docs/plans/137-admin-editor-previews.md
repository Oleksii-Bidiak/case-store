# Plan 137 — Admin Editor Live Previews (TASK-265, TASK-266)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 5 (Адаптив/дизайн + прев'ю контенту + хвости)
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG tasks:** TASK-265, TASK-266
> **Runs in:** worktree branch `feature/137-admin-previews`, **store-admin only**. No `store-api`
> changes are planned (see "Why no new backend endpoints" below) and no other app is touched.

## Overview

Two independent, same-shaped admin-editor UX gaps, bundled into one plan because they share a
pattern (a presentational, props-only preview component fed by `react-hook-form`'s `useWatch`,
exactly the way `SeoSnippetPreview` already works in `product-form`/`page-form`/`category-form`)
and a constraint (both touch `apps/store-admin/src/shared/config/dictionary.ts`, so they are
planned together to avoid two agents racing on the same file section):

- **TASK-265** — `banner-form` renders four different placements (`HERO_SLIDE` hero slider,
  `PROMO_TILE` promo card, `PROMO_BANNER` wide promo, `ANNOUNCEMENT_BAR` top strip) but the admin
  currently has no way to see which one they're building until it's published on the live site.
  This plan adds a live, in-admin **rebuilt** (not iframed) preview of the selected placement,
  updating on every keystroke via `useWatch`, plus a mobile/desktop **viewport-simulation**
  toggle inside the preview panel.
- **TASK-266** — `page-form` and `blog-post-form` both hold a Tiptap `RichTextEditor` for the
  body, but admins only see raw, unstyled Tiptap chrome while writing — no sense of the
  storefront's actual typography until after publishing. This plan adds an inline **"Перегляд"**
  tab next to the editor that renders the exact same (unsaved) HTML through a simplified
  storefront-prose stylesheet ported into `store-admin`.

**Both tasks are pure `store-admin` frontend work.** No Prisma migration, no new `store-api`
route, no Orval regen — every field the previews need is already present in the existing
`BannerFormValues` / `PageFormValues` / `BlogPostFormValues` shapes.

### Why no new backend endpoints

The brief allows "possibly small `store-api` preview endpoints if truly needed" but explicitly
prefers none. Neither task needs one:

- The banner preview only needs the six banner fields the form already holds in memory
  (`placement`, `title`, `subtitle`, `imageUrl`, `ctaLabel`, `ctaHref`, `theme`) — nothing from
  the server that isn't already on the form.
- The page/blog preview only needs the `content` HTML the Tiptap editor already holds in memory —
  rendering it is a pure client-side concern (see the Sanitization Decision below), not a fetch.

Both previews are **unsaved-draft previews of the current form state**, not "what does the
published entity look like on the live site" (that already exists for products via
`/products/preview/[slug]`, see TASK-266's Design Decision 1 below) — so there is nothing for a
`store-api` round-trip to add.

## Scope

### In Scope

- **TASK-265:** a new presentational `shared/ui` component that renders a simplified, faithful
  visual reconstruction of each of the four `BannerPlacement` values, wired live into
  `banner-form.tsx` via `useWatch`; a mobile/desktop viewport-simulation toggle inside the preview
  panel; the admin's own responsive layout for the form+preview pair (side-by-side on `md:`+,
  tab-toggle on `<md`, per the shared admin-mobile convention TASK-257 established elsewhere but
  is forbidden from applying to this file — see Constraints).
- **TASK-266:** a new presentational `shared/ui` component that renders sanitized/live Tiptap
  HTML through a ported, simplified storefront-prose stylesheet; wired into `page-form.tsx` and
  `blog-post-form.tsx` as an inline **"Редагування" / "Перегляд" tab pair** replacing the bare
  editor slot (recommendation from the brief: "inline live tab for drafts + keep it simple" — no
  side-by-side split, no new preview route). An audit-and-close-out of the "add a prominent
  «Переглянути як на сайті» button to product-form if missing" backlog line (finding: it already
  exists — see Design Decision 1).
- New dictionary namespaces `bannerPreview` (TASK-265) and `contentPreview` (TASK-266), appended
  to `apps/store-admin/src/shared/config/dictionary.ts` — see the exact key lists in each task's
  Technical Design for parallel-group collision avoidance.
- RTL/Jest unit tests for both new `shared/ui` preview components and for the live-wiring in all
  three forms (`banner-form`, `page-form`, `blog-post-form`) — `banner-form.tsx` and
  `blog-post-form.tsx` get their **first** `.test.tsx` files in this plan; `page-form.test.tsx`
  already exists (TASK-268's SERP-preview specs) and gets new `describe` blocks appended.
- A `## TASK-265` / `## TASK-266` manual-QA section appended to the end of
  `docs/manual-qa-pending.md` by the implementing build agent (visual-fidelity checks that can't
  be asserted by RTL — see each task's Acceptance Criteria).

### Out of Scope

- Any `store-api` change (see "Why no new backend endpoints" above).
- Any change to `apps/store-client` — both previews are **rebuilt, simplified reconstructions**
  inside `store-admin`, not iframes of the real storefront and not imports of storefront
  components (storefront files are read-only reference material for this plan; FSD forbids
  cross-app imports anyway — there is no `store-client` package export surface to import from).
- A real "open the live storefront URL in a new tab" link (would need a
  `NEXT_PUBLIC_STOREFRONT_URL` env var plus cross-origin linking design) — flagged as a Notes
  follow-up, not built here. The existing `/products/preview/[slug]` admin-side reconstruction
  (TASK-155) remains the only "view as customer" affordance for products, and this plan does not
  touch it beyond confirming it already satisfies the backlog line.
- Restructuring any form other than `banner-form.tsx`, `page-form.tsx`, `blog-post-form.tsx`.
  This plan **owns** the layout of exactly those three files, including their `<md` mobile
  behaviour — TASK-258 (admin mobile tables & forms, parked in the same wave) is explicitly
  forbidden from touching them (see Constraints).
- A generic `AttributeDefinition`/other structured-content preview — only the two rich-text forms
  (`page-form`, `blog-post-form`) and the one structured-fields form (`banner-form`) are in scope.
- Adding a client-side HTML sanitizer package (`isomorphic-dompurify`, `sanitize-html`, etc.) to
  `store-admin` — see TASK-266's Sanitization Decision for why this is deliberately not needed.

## User Stories

1. As the store owner, I want to see what a hero slide / promo tile / promo banner / announcement
   bar will actually look like **while I'm still typing it**, so I don't have to save, open the
   storefront in another tab, and reload to catch a typo or an awkward line break.
2. As the store owner, I want to see my blog post or legal/info page rendered in the site's real
   typography **before I publish it**, so headings, lists, and quotes read the way a customer will
   actually see them, not as bare Tiptap editor chrome.
3. As the store owner using my phone to manage the shop (TASK-257), I want the banner/page/blog
   forms to still work — the preview shouldn't crowd out the fields I'm editing on a small screen.

## Constraints (binding on the implementing build agent)

- **File ownership.** This plan is the sole owner of `banner-form.tsx`, `page-form.tsx`, and
  `blog-post-form.tsx` for the duration of Хвиля 5. TASK-258 (admin mobile tables & forms, same
  wave) must not touch these three files even though its brief is "mobile admin forms" in
  general — their `<md` behaviour is defined here.
- **Dictionary namespaces.** Only add keys under the two new top-level namespaces named below
  (`bannerPreview`, `contentPreview`). Do not add preview-related keys under `bannerForm`,
  `pageForm`, or `blogPostForm` (those namespaces are stable and other groups may be editing
  nearby lines in the same wave) — keep new namespaces additive blocks appended after the existing
  `bannerForm` / `blogPostForm` sections respectively (see each task's dictionary key list for the
  exact insertion point).
- **No hand-edits under `**/shared/api/generated/`\*\* — not touched by this plan anyway (no Orval
  regen needed), stated here only because the PreToolUse hook blocks it project-wide.
- **`docs/manual-qa-pending.md`** — append-only. Add exactly two new `## TASK-265` and
  `## TASK-266` sections at the end of the file (after the last existing `##` section); do not
  edit any earlier section.
- **`BACKLOG.md`** — not touched by this plan document or by the build agent; the orchestrator
  updates it.
- **Verification gate** (per task, before either is considered done):
  `npm run lint -w apps/store-admin`, `npm run typecheck -w apps/store-admin`, and
  `npm run test -w apps/store-admin` (jsdom RTL/MSW project — see the `frontend-testing` skill;
  neither task needs the node-logic project since there's no non-React pure-function module large
  enough to warrant one, beyond what's noted per task below) all green. Per the store-client Jest
  parallel-flake precedent, fall back to `--runInBand` if the full suite times out under parallel
  load.

## Technical Design

### Shared pattern: presentational preview components live in `shared/ui`

Both new components follow the exact shape `SeoSnippetPreview` already established
(`apps/store-admin/src/shared/ui/seo-snippet-preview/seo-snippet-preview.tsx`): a pure function
of already-resolved primitive props — no Orval hooks, no `react-hook-form` import, no business
logic. The owning form (`banner-form.tsx` / `page-form.tsx` / `blog-post-form.tsx`) is the only
place that calls `useWatch` and passes the live values down. This keeps the preview components
independently unit-testable (mount with fixed props, assert markup) and reusable if a future
"preview an already-published entity" screen ever wants the same rendering.

---

## Tasks

### TASK-265: Live banner preview in `banner-form`

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No (presentational component + wiring, not business-rule logic) — still fully
RTL-tested per the acceptance criteria below.
**Depends on:** —

#### Design Decision — rebuild, not iframe

Per the brief's default: rebuild a simplified presentation **inside admin**, not an iframe of a
draft storefront route. Rationale:

- An iframe would need a real, addressable storefront URL rendering **unsaved** form state — that
  either means a new `store-api` draft-preview endpoint (explicitly the thing this plan avoids) or
  a client-side `postMessage` bridge into an iframed storefront page, which is materially more
  complex than four small presentational React trees for four fixed layouts.
- `BannerPlacement` has exactly four values, each a small, well-understood layout (confirmed by
  reading the storefront originals below) — a faithful reconstruction is a bounded amount of work,
  not an open-ended redesign surface.
- Precedent: `AdminProductPreviewView` (`apps/store-admin/src/widgets/admin-product-preview/`)
  already rebuilds a product's presentation admin-side rather than iframing the storefront PDP.
  This plan follows the same established pattern for banners.

#### Storefront originals read for this reconstruction (visual spec, not imported)

| Placement          | Storefront source (read-only reference)                          | Key visual facts to mirror                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HERO_SLIDE`       | `apps/store-client/src/widgets/hero-banner/ui/hero-slider.tsx`   | Rounded-2xl card, fixed height (420–440px full-size), per-slide gradient background, eyebrow pill (optional) + `h1`-scale bold title + subtitle + CTA button. The real component picks one of 3 hardcoded gradient themes by **array position** (`THEMES[index % 3]`) — a single-banner preview has no "position", so default deterministically to `THEMES[0]` (indigo→violet, white text, frosted decorative panel) and document this simplification in the component's header comment. |
| `PROMO_TILE`       | `apps/store-client/src/widgets/hero-banner/ui/promo-tiles.tsx`   | Rounded-2xl bordered card, optional badge pill, bold title, optional body text, optional CTA row with an arrow icon. Accent (`sale` / `primary` / `success`) is resolved from the `theme` field when it **literally** matches one of those three strings (`ACCENT_CYCLE.find`); otherwise the real component falls back to a **position-based rotation** it can't reconstruct standalone — default to `"primary"` when `theme` doesn't match, same simplification note as above.         |
| `PROMO_BANNER`     | `apps/store-client/src/widgets/promo-banner/ui/promo-banner.tsx` | Wide rounded-2xl card, dark gradient background, white text, bold title, optional subtitle, CTA button rendered **only when both `ctaLabel` and `ctaHref` are present** (mirror this conditional exactly — a lone `ctaLabel` with no `ctaHref` shows no button on the real site either).                                                                                                                                                                                                 |
| `ANNOUNCEMENT_BAR` | `apps/store-client/src/widgets/header/ui/announcement-bar.tsx`   | Slim dark strip. **Only `title` and `ctaHref` are used** — `subtitle`, `ctaLabel`, `imageUrl`, `theme` are all ignored by the real component. The preview must reflect this exactly (do not render subtitle/CTA-label text here — that would mislead the admin into thinking those fields matter for this placement).                                                                                                                                                                    |

#### New component: `shared/ui/banner-placement-preview`

```ts
// apps/store-admin/src/shared/ui/banner-placement-preview/banner-placement-preview.tsx
export interface BannerPlacementPreviewProps {
  placement: BannerPlacementValue; // reuse the existing type from banner-schema
  title: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  theme?: string;
}
export function BannerPlacementPreview(
  props: BannerPlacementPreviewProps,
): JSX.Element;
```

Internally dispatches on `placement` to one of four small sub-renderers (`HeroSlidePreview`,
`PromoTilePreview`, `PromoBannerPreview`, `AnnouncementBarPreview`), each a private function in
the same file (mirrors the four-in-one-file convention `admin-product-preview-view.tsx` already
uses for its own sections) — no need for four separate files at this size. Empty `title` renders
an italic placeholder string (`bannerPreview.emptyTitle`), mirroring `SeoSnippetPreview`'s
`title || d.emptyTitle` pattern, so the panel never looks broken before the admin types anything.

**Mobile/desktop viewport-simulation toggle** (a feature of the preview panel itself, independent
of the admin's own browser width): two small segmented buttons ("Десктоп" / "Мобільний") above the
rendered banner, backed by local `useState<'desktop' | 'mobile'>` **inside**
`BannerPlacementPreview` (not lifted to the form — this is pure display state, not form data, so
`docs/conventions/forms.md`'s async-seed guard does not apply). `"mobile"` constrains the
rendered banner's outer wrapper to `max-w-[375px]` (a common phone viewport width already used
elsewhere in the codebase's responsive breakpoints); `"desktop"` renders at the panel's natural
width. Default: `"desktop"`.

#### `banner-form.tsx` wiring + responsive layout

- Add `useWatch({ control, name: [...] })` (or five/six individual `useWatch` calls, matching the
  existing per-field style already used in `product-form.tsx`/`page-form.tsx` rather than the
  array form) for `placement`, `title`, `subtitle`, `imageUrl`, `ctaLabel`, `ctaHref`, `theme`;
  pass them straight into `<BannerPlacementPreview />`.
- **Admin-viewport responsiveness (this plan's own `<md` behaviour, distinct from the
  viewport-simulation toggle above):** restructure the form into two always-mounted panels — the
  existing field stack, and the new preview — laid out as
  `md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-6` on `md:`+ (fields left,
  sticky `md:sticky md:top-20` preview right), and a `Tabs`/`TabsList`/`TabsTrigger` pair
  ("Форма" / "Прев'ю") that becomes visible **only** below `md` to switch which panel is shown.
  **Pitfall to avoid:** do not use `TabsContent`'s default unmount-on-inactive behaviour to
  implement the panel switch — that would repeatedly unmount/remount the `<form>`'s field DOM,
  which is himself fine for RHF (state lives in `useForm`, not the DOM) but is unnecessary
  churn and would unmount+remount the preview's own local viewport-toggle state on every tab
  switch. Instead, keep both panels permanently mounted inside the one `<form>` and drive
  visibility with a plain `activeTab` state + Tailwind `className={activeTab === 'form' ? '' :
'hidden'} md:!block` (or equivalent) — the `Tabs` primitive is used purely as the visual chrome
  (`value`/`onValueChange`), not as the mounting mechanism. Document this choice in a code comment
  since it deviates from the `Tabs` component's default usage elsewhere in the app.
- The whole `<form>` element itself is not duplicated — one `<form onSubmit={...}>` wraps both
  panels regardless of which is visually shown, so `handleSubmit` and validation errors keep
  working identically on mobile and desktop.

#### Dictionary additions — new `bannerPreview` namespace (append after `bannerForm`)

```
bannerPreview: {
  heading: "Попередній перегляд",
  tabForm: "Форма",
  tabPreview: "Прев'ю",
  viewportDesktop: "Десктоп",
  viewportMobile: "Мобільний",
  emptyTitle: "Заголовок банера…",
  announcementBarNote: "Для «Смуга оголошень» використовуються лише заголовок і посилання кнопки.",
}
```

(`announcementBarNote` renders as a small muted-text hint under the `ANNOUNCEMENT_BAR` preview
variant only — a direct, low-cost fix for the exact confusion the "storefront originals" table
above flags: subtitle/CTA-label fields exist on the form but do nothing for this one placement.)

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/ui/banner-placement-preview/banner-placement-preview.tsx`
      exports `BannerPlacementPreview` rendering all four `BannerPlacement` variants per the
      "storefront originals" table above, including the documented single-banner simplifications
      (fixed `THEMES[0]` for `HERO_SLIDE`, `"primary"` default accent for `PROMO_TILE`,
      `PROMO_BANNER`'s CTA-button-only-when-both-fields-present rule,
      `ANNOUNCEMENT_BAR`'s title/ctaHref-only rule).
- [ ] Mobile/desktop viewport-simulation toggle implemented as local component state (not lifted
      to the form), defaulting to `"desktop"`; toggling constrains the preview's outer width.
- [ ] Empty `title` renders `dict.bannerPreview.emptyTitle` instead of a blank space.
- [ ] `banner-form.tsx` watches the seven relevant fields via `useWatch` and passes them live into
      `BannerPlacementPreview` — typing in any watched field updates the preview with no page
      reload/no re-render flash on unrelated fields.
- [ ] Responsive split implemented exactly per the "admin-viewport responsiveness" spec above:
      side-by-side on `md:`+, `Tabs`-toggled single-panel-visible on `<md`, both panels always
      DOM-mounted (no `TabsContent` unmount-based switching), one single `<form>` element.
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` gains the `bannerPreview` namespace with
      exactly the keys listed above (no additions under `bannerForm`).
- [ ] `apps/store-admin/src/shared/ui/index.ts` re-exports `BannerPlacementPreview` +
      `BannerPlacementPreviewProps`.
- [ ] New `banner-placement-preview.test.tsx` (RTL): one test per placement asserting the
      variant-specific markup/text renders from fixed props, plus a test asserting the
      `ANNOUNCEMENT_BAR` variant does **not** render `subtitle`/`ctaLabel` text even when passed,
      and a test for the empty-title placeholder.
- [ ] New `banner-form.test.tsx` (RTL, first test file for this component — mirror
      `page-form.test.tsx`'s `renderWithProviders` conventions; no MSW mocking needed since
      `banner-form` calls no Orval hook itself): a live-typing test (type into the title field,
      assert the preview text updates), a placement-switch test (changing the `placement` select
      swaps which preview variant renders), and a `<md`-vs-`md:`+ responsive-toggle test (assert
      the `Tabs` trigger is present/functional — jsdom has no real viewport, so this test exercises
      the tab-switch logic itself, not actual CSS breakpoint behaviour, per this app's existing
      RTL conventions for responsive components).
- [ ] `npm run lint`/`typecheck` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- banner-placement-preview banner-form`.
- [ ] Manual-QA: append a `## TASK-265` section to `docs/manual-qa-pending.md` (end of file) with
      steps to visually confirm all four placements at a real browser width against the actual
      published storefront look (jsdom/RTL cannot assert pixel-level visual fidelity).

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/banner-placement-preview/banner-placement-preview.tsx` — new
- `apps/store-admin/src/shared/ui/banner-placement-preview/banner-placement-preview.test.tsx` — new
- `apps/store-admin/src/shared/ui/index.ts` — export additions
- `apps/store-admin/src/features/banner-form/ui/banner-form.tsx` — live preview wiring + responsive
  split/tab layout
- `apps/store-admin/src/features/banner-form/ui/banner-form.test.tsx` — new
- `apps/store-admin/src/features/banner-form/model/banner-schema.ts` — read-only reference (reuse
  `BANNER_PLACEMENT`/`BannerPlacementValue`); no changes expected, but re-verify no fallout if the
  build agent finds a reason to touch it
- `apps/store-admin/src/shared/config/dictionary.ts` — new `bannerPreview` namespace
- `docs/manual-qa-pending.md` — new `## TASK-265` section appended at the end

---

### TASK-266: Page/blog preview beside editor

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

#### Design Decision 1 — product-form's "Переглянути як на сайті" button already exists

Audited `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx:90-99`: the
product edit view already renders a `target="_blank"` link (`dict.products.previewLink` =
"Переглянути") to `/products/preview/${product.slug}` next to the "Редагувати товар" heading,
whenever an existing product is loaded. This is the exact "prominent preview button" the backlog
line asks for (TASK-155 built it; `AdminProductPreviewView` is the admin-side reconstruction it
opens, same "rebuild, don't iframe" pattern this plan follows for banners). **No product-form
changes are needed for TASK-266** — this is a verification-only finding, recorded here so the
build agent doesn't duplicate the button. See "Out of Scope" for the (deliberately deferred) idea
of a real cross-origin storefront link.

#### Design Decision 2 — inline preview **tab**, not a side-by-side split, not a new route

Per the brief's own recommendation ("recommend inline live tab for drafts + keep it simple"):
`page-form.tsx` and `blog-post-form.tsx` each get a `Tabs` pair — **"Редагування"** (the existing
`RichTextEditor`) and **"Перегляд"** (the new prose-rendered preview) — replacing the bare editor
slot in place. This is simpler than TASK-265's split/toggle scheme and needs **no separate `<md`
handling**: a tab pair that shows exactly one panel at a time is already mobile-friendly at every
viewport, with zero extra breakpoint code. This satisfies the "this group owns the `<md` mobile
behaviour of these three forms" constraint trivially for these two forms (there is no
breakpoint-conditional layout to get wrong).

Switching tabs unmounts/remounts the `RichTextEditor`'s internal Tiptap instance (Radix
`TabsContent`'s default behaviour) — this is **safe** here, unlike a bare form input: `value` is
fully controlled from the RHF field (`docs/conventions/forms.md` concerns `useState` seeded from
async server props, not a controlled child re-initializing from an always-current controlled
prop), so re-mounting the editor on tab-back re-seeds it with the exact same up-to-date HTML with
no data loss. The only user-visible cost is losing cursor position / scroll position inside the
editor when switching tabs and back — an accepted, standard trade-off for this UI pattern (the
same one GitHub's markdown "Preview" tab has). Document this trade-off in a code comment; no
special engineering to preserve editor focus/cursor across tab switches is in scope.

#### Design Decision 3 (Sanitization) — render Tiptap's live HTML directly, no client-side sanitizer

The brief flags this as a decision point ("decide sanitization approach... justify choice").
**Decision: render `content` (the live, in-memory Tiptap `getHTML()` output already bound to the
RHF field) directly via `dangerouslySetInnerHTML`, with no client-side sanitization step, and add
no new sanitizer dependency to `store-admin`.**

Justification:

- **The HTML is schema-constrained by construction, not arbitrary.** `RichTextEditor` builds its
  Tiptap instance from `StarterKit.configure({ heading: { levels: [2, 3] } })` only (see
  `apps/store-admin/src/shared/ui/rich-text-editor/rich-text-editor.tsx`) — no `Image`, no `Link`,
  no raw-HTML extension is registered. Tiptap's `getHTML()` is ProseMirror's schema-driven
  serializer: it can only emit the node/mark types the schema defines (`paragraph`, `heading`,
  `bold`, `italic`, `underline`, `strike`, `bulletList`/`orderedList`/`listItem`, `blockquote`,
  `codeBlock`, `hardBreak`, `horizontalRule`) with **no arbitrary attributes** — there is no
  registered schema path that can produce a `<script>` tag, an `on*` event-handler attribute, or a
  `javascript:` URL, regardless of what an admin pastes into the editor (pasted HTML is parsed
  through the same schema on paste, silently dropping anything the schema doesn't recognize). This
  is a materially different threat model from `store-client`'s `sanitizeHtml()` /
  `store-api`'s `sanitizeRichText()`, which both defend against **untrusted, already-serialized
  HTML strings** arriving from outside the editor's own runtime (a saved DB row, a different
  client entirely) — a threat this preview does not face, because it renders the _live in-memory
  editor state of the current session_, never a foreign string.
- **The preview never leaves the browser and is never shown to anyone but the authoring admin.**
  It renders inside the same admin's own tab, from the same admin's own unsent draft — there is no
  second user who could be attacked by it, unlike the storefront's `sanitizeHtml()` call (which
  guards against a stored value being rendered to every visitor) or the API's `sanitizeRichText()`
  call (the actual persistence/publication boundary, which stays completely unchanged by this
  plan and remains the real security control).
- **Avoids a new dependency for a redundant guarantee.** `isomorphic-dompurify` is already a
  `store-client` dependency but not a `store-admin` one; adding it here only to re-sanitize HTML
  that is already schema-safe by construction would be defense-in-depth with no attacker this
  preview is actually exposed to, at the cost of a new dependency plus non-trivial bundle weight
  for an admin-only page. If the `RichTextEditor`'s Tiptap extension set ever grows to include
  `Image`/`Link`/raw-HTML paste, this decision should be revisited (flagged in Risks below).

This mirrors the reasoning `docs/plans/135-customer-card.md` and others use for "explicit,
documented trade-off, not an oversight" — write the same rationale as a code comment atop the new
preview component so a future reader isn't tempted to "fix" a non-issue.

#### New component: `shared/ui/rich-text-preview`

```ts
// apps/store-admin/src/shared/ui/rich-text-preview/rich-text-preview.tsx
export interface RichTextPreviewProps {
  html: string;
  /** Shown instead of the prose block when `html` is empty/whitespace-only. */
  emptyLabel?: string;
}
export function RichTextPreview({
  html,
  emptyLabel,
}: RichTextPreviewProps): JSX.Element;
```

Prose typography ported from `apps/store-client/src/widgets/blog/ui/blog-article-body.tsx`'s
`PROSE` constant (a self-contained Tailwind arbitrary-variant class-string array — no external
global CSS file needed, unlike `legal-doc-body`'s counter-based `globals.css` rules, which are
deliberately **not** ported here to keep this a single self-contained component with no new global
stylesheet edits). The allow-listed tag set matches exactly, since both `Page.content` and
`BlogPost.content` are sanitized server-side by the same shared `sanitizeRichText()`
(`apps/store-api/src/common/sanitize/sanitize-rich-text.ts`, confirmed reused verbatim by
`apps/store-api/src/blog/blog.service.ts:25,131,187` and `apps/store-api/src/pages/pages.service.ts`)
— one component serves both forms with no per-entity variant needed. Empty/whitespace `html`
renders `emptyLabel` (or a generic fallback if the caller doesn't pass one) inside a muted
placeholder, mirroring the same "don't look broken before the admin types anything" pattern as
TASK-265's preview.

#### `page-form.tsx` / `blog-post-form.tsx` wiring

- Watch `content` via `useWatch({ control, name: "content" })` (both forms already `useWatch`
  other fields the same way — no new pattern).
- Replace the bare `<Controller name="content" render={...}><RichTextEditor .../></Controller>`
  block with a `Tabs defaultValue="edit"` wrapping two `TabsTrigger`s
  (`dict.contentPreview.tabEdit` / `dict.contentPreview.tabPreview`) and two `TabsContent`s: the
  first contains the existing `Controller`/`RichTextEditor` unchanged, the second renders
  `<RichTextPreview html={contentValue} emptyLabel={dict.contentPreview.emptyContent} />`. No
  other field in either form changes position or width — this is a localized replacement of the
  one field's rendering, not a form-wide layout change.
- `page-form.test.tsx` currently stubs `RichTextEditor` to `() => null` (see its existing
  `jest.mock`) for the unrelated SERP-preview tests — that mock stays valid since the new Tabs
  wrapper doesn't change how `RichTextEditor` itself is invoked; the new preview-tab tests for this
  task must **not** rely on that same blanket stub (they need to assert real preview markup), so
  add them to a dedicated `describe` block that either avoids the global mock (if Jest's module
  registry allows per-`describe` overrides here) or, more robustly, stub `RichTextEditor` to a
  lightweight `<textarea>` proxy (`value`/`onChange` passthrough) **only within this task's new
  test file(s)**, so `userEvent.type` can drive the `content` field and the preview tab can be
  asserted to reflect it live — this is the same "lightweight controlled stub" idea already
  described for TASK-266's own coverage plan below.

#### Dictionary additions — new `contentPreview` namespace (shared by page-form + blog-post-form)

```
contentPreview: {
  tabEdit: "Редагування",
  tabPreview: "Перегляд",
  emptyContent: "Почніть писати, щоб побачити попередній перегляд…",
}
```

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/ui/rich-text-preview/rich-text-preview.tsx` exports
      `RichTextPreview`, rendering `html` via `dangerouslySetInnerHTML` inside a ported prose
      wrapper (headings/paragraphs/lists/links/blockquotes styled per the `blog-article-body.tsx`
      `PROSE` reference), with a code comment recording the Sanitization Decision verbatim
      (no client sanitizer, why it's safe here, when to revisit).
- [ ] Empty/whitespace `html` renders `emptyLabel` (or a sane default) instead of an empty prose
      block.
- [ ] **No new npm dependency added to `apps/store-admin/package.json`** for this task (grep-
      verifiable: no `isomorphic-dompurify`/`sanitize-html`/`dompurify` entry appears in the diff).
- [ ] `page-form.tsx`: the content field is wrapped in a `Tabs`/`TabsTrigger`("Редагування"/
      "Перегляд")/`TabsContent` pair; the editor tab is unchanged (`RichTextEditor` still receives
      `field.value`/`field.onChange` from the same `Controller`); the preview tab renders
      `<RichTextPreview html={contentValue} .../>` live from `useWatch`.
- [ ] `blog-post-form.tsx`: identical wiring.
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` gains the `contentPreview` namespace with
      exactly the keys listed above (no additions under `pageForm`/`blogPostForm`).
- [ ] `apps/store-admin/src/shared/ui/index.ts` re-exports `RichTextPreview` +
      `RichTextPreviewProps`.
- [ ] New `rich-text-preview.test.tsx` (RTL): renders known HTML and asserts heading/paragraph/
      list/blockquote markup appears with the expected prose classes; asserts the empty-state
      placeholder when `html` is `""`/whitespace-only.
- [ ] `page-form.test.tsx` gains a new `describe` block (separate from the existing TASK-268 SERP
      tests, using a controlled `<textarea>`-style `RichTextEditor` stub local to this block, per
      the wiring note above) asserting: typing content and switching to the "Перегляд" tab shows
      the typed content rendered through `RichTextPreview`; the existing SERP-preview `describe`
      block (with its `() => null` stub) is left untouched and still green.
- [ ] New `blog-post-form.test.tsx` (first test file for this component): same live-typing +
      tab-switch assertion as `page-form`'s new block, plus a smoke test for the form's other
      existing fields (title/slug/category/excerpt/author/cover/reading-minutes/featured/status)
      rendering and validating, matching the coverage `page-form.test.tsx`/`banner-form.test.tsx`
      already establish for their own forms.
- [ ] Verified: `edit-product-view.tsx`'s existing "Переглянути" link to `/products/preview/[slug]`
      is unchanged by this plan (Design Decision 1 — no product-form edits needed).
- [ ] `npm run lint`/`typecheck` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- rich-text-preview page-form blog-post-form`.
- [ ] Manual-QA: append a `## TASK-266` section to `docs/manual-qa-pending.md` (end of file, after
      TASK-265's section) with steps to visually confirm the preview tab's typography against a
      real published `/blog/[slug]` and `/legal/[slug]` page in a real browser.

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/rich-text-preview/rich-text-preview.tsx` — new
- `apps/store-admin/src/shared/ui/rich-text-preview/rich-text-preview.test.tsx` — new
- `apps/store-admin/src/shared/ui/index.ts` — export additions
- `apps/store-admin/src/features/page-form/ui/page-form.tsx` — Tabs-wrap the content field
- `apps/store-admin/src/features/page-form/ui/page-form.test.tsx` — new `describe` block appended
- `apps/store-admin/src/features/blog-post-form/ui/blog-post-form.tsx` — Tabs-wrap the content
  field
- `apps/store-admin/src/features/blog-post-form/ui/blog-post-form.test.tsx` — new
- `apps/store-admin/src/shared/config/dictionary.ts` — new `contentPreview` namespace
- `docs/manual-qa-pending.md` — new `## TASK-266` section appended at the end (after TASK-265's)

## Migration Steps

TASK-265 and TASK-266 touch disjoint feature files (`banner-form` vs `page-form`/`blog-post-form`)
and disjoint new `shared/ui` component directories; their only shared file is
`dictionary.ts` (two additive, non-overlapping namespaces) and `shared/ui/index.ts` (two additive
export blocks). Both are safe to implement in either order, or interleaved, within the same
worktree/branch:

1. TASK-265 — `BannerPlacementPreview` component + tests, then `banner-form.tsx` wiring +
   responsive layout + tests, then its `bannerPreview` dictionary block.
2. TASK-266 — `RichTextPreview` component + tests, then `page-form.tsx` wiring + tests, then
   `blog-post-form.tsx` wiring + tests, then its `contentPreview` dictionary block.
3. Append both `## TASK-265` / `## TASK-266` manual-QA sections to
   `docs/manual-qa-pending.md` once their respective automated ACs are green.
4. Full workspace gate: `npm run lint -w apps/store-admin`, `npm run typecheck -w apps/store-admin`,
   `npm run test -w apps/store-admin` (fall back to `--runInBand` if needed).

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BannerPlacementPreview`'s single-banner accent/theme-index simplifications (fixed `THEMES[0]`, default `"primary"` accent) could look visibly different from how the banner actually renders once other banners of the same placement exist and shift its position | Documented explicitly in the component's header comment and in this plan's "storefront originals" table; flagged in the new `## TASK-265` manual-QA section as a known, accepted approximation, not a bug to chase                                                                                                                                                |
| Radix `Tabs`'s default unmount-on-inactive `TabsContent` behaviour, if used carelessly for TASK-265's `<md` panel switch, would repeatedly remount the form's field DOM and the preview's own local viewport-toggle state                                           | TASK-265's Acceptance Criteria explicitly require the "both panels always mounted, `Tabs` used only as visual chrome" implementation — call out as a concrete, testable requirement, not left to the build agent's default instinct                                                                                                                               |
| The Sanitization Decision (no client sanitizer) becomes wrong if `RichTextEditor`'s Tiptap extension set ever grows to include `Image`, `Link`, or a raw-HTML/markdown-paste extension, none of which are schema-constrained the same safe way                      | The code comment in `rich-text-preview.tsx` explicitly says "revisit if extensions change"; not a concern for _this_ plan since `RichTextEditor`'s extension set is unchanged by it                                                                                                                                                                               |
| `blog-post-form.tsx` has no existing `.test.tsx` — this plan's new file is also this component's _only_ regression coverage for its non-preview fields (title/slug/category/etc.), unlike `page-form.tsx` which already had TASK-268 coverage to build on           | Acceptance Criteria explicitly require the new `blog-post-form.test.tsx` to also smoke-test the form's pre-existing fields, not just the new preview tab, so this plan leaves the component with baseline coverage rather than none                                                                                                                               |
| Two build-agent passes (TASK-265, TASK-266) editing the same `dictionary.ts` file and `shared/ui/index.ts` file could produce a merge conflict if run as literally parallel/concurrent edits rather than sequential commits within the same worktree                | Both tasks' dictionary/export additions are append-only and non-overlapping (documented exact key lists above); since both tasks share **one** worktree/branch per this plan's header, sequential commits (not parallel worktrees) avoid the conflict entirely — no cross-worktree coordination is needed here, unlike plan 135/134's sibling-worktree constraint |

## Notes

- **Deferred:** a real "open the live storefront in a new tab" link using a
  `NEXT_PUBLIC_STOREFRONT_URL` env var (distinct from the existing admin-side
  `/products/preview/[slug]` reconstruction) — would give `page-form`/`blog-post-form`/
  `banner-form` a genuine cross-origin "view as customer" affordance for **published** entities,
  complementary to (not a replacement for) the unsaved-draft preview this plan builds. Worth a
  follow-up task once the store has a stable public domain to link to (ties into the
  `docs/deploy-vercel.md` / `docs/deploy.md` domain setup).
- **Not built:** a `store-api` "server-rendered preview HTML" endpoint. If a future requirement
  ever needs the preview to reflect content the storefront's _own_ server-side rendering pipeline
  would apply (e.g. a future rich-text extension that needs server-side normalization before
  display), that would be the trigger to revisit "Why no new backend endpoints" above — not
  something either TASK-265 or TASK-266 needs today.
- Both new `shared/ui` preview components are deliberately **read-only, presentational, and
  props-only** — if a later task wants to preview an _already-published_ banner/page/blog entity
  (as opposed to unsaved form state), it can reuse `BannerPlacementPreview`/`RichTextPreview`
  directly by passing the persisted entity's fields, with zero changes to either component.
