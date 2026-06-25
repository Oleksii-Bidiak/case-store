# Plan: Product Card Variant Mismatch + Gallery Thumbnails Missing

> **Status:** Implemented — pending manual QA (TASK-126-E)
> **Phase:** Phase A — Stabilize & Close Out (QA pass triage — bugs)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-25
> **TASK:** TASK-126

---

## Resolution (implemented)

- **TASK-126-A:** Root causes confirmed (see Investigation): SKU/slug-collision hypotheses
  refuted (`@unique`); wrong-variant = product-level card sale badge vs. alphabetically-first
  active variant as PDP default; missing thumbnails = correct `images.length > 1` gate + seed
  data gap (deferred to TASK-128).
- **TASK-126-B (fix):** Extracted a pure `pickCheapestActiveVariantId(variants)` helper
  (`pick-default-variant.ts`); `product-detail-view.tsx` now computes `defaultVariantId` via a
  `useMemo` over it, so the PDP pre-selects the cheapest active variant (matching the card's
  advertised base price) instead of the first by name. The `selectedVariantId ?? defaultVariantId`
  override pattern is preserved.
- **TASK-126-C:** Gallery strip gate confirmed correct by design — no code change. Added a
  render-level regression test documenting the gate.
- **TASK-126-D (tests):** `pick-default-variant.test.ts` (6 unit cases, TDD Red→Green —
  cheapest/numeric/inactive/empty/tie), `product-detail-view.test.tsx` (component: cheapest
  variant pre-selected, not first-by-name), `product-image-gallery.test.tsx` (strip hidden for 1
  image, one button per image, click swaps active).
- Gates: store-client **83/83** tests pass; lint clean; typecheck clean. No backend change, no
  Prisma migration, no Orval regen.
- **TASK-126-E:** Manual QA on a running stack still pending; seed-image overhaul tracked under
  TASK-128.

---

## Problem Statement

QA report (`docs/manual-qa-master.md` line 207–211, item A1):

> "Сторінка товару відкривається, але не той варіант, який був на картці (клікнув на акційний
> товар, а відкривася інший, той товар, що акційний потрібно було обрати у варіантах товару —
> можливо через те, що 1 артикул існує для більше ніж 1 товару). Мініатюр немає (можливо через
> те, що зображення тільки 1). Назва, ціна, акційна ціна закреслена, артикул (SKU), опис,
> хлібні крихти — це все є."
>
> Translation: "The product page opens, but not the variant that was on the card (clicked a SALE
> item, but a different one opened — the sale item then had to be selected among the product's
> variants — possibly because one SKU exists for more than one product). No thumbnails (possibly
> because there is only 1 image). Name, price, struck-through sale price, SKU, description,
> breadcrumbs — all present and correct."

There are two distinct symptoms with separate root causes:

1. **"Wrong variant / sale mismatch"** — the grid card shows a sale badge and the lowest variant
   price, but the PDP that opens defaults to the first active variant alphabetically, which is not
   necessarily the sale/cheapest variant. The user perceives that "a different item opened."
2. **"No thumbnails"** — the gallery thumbnail strip does not appear.

---

## Investigation and Root Cause Confirmation

### Hypothesis A: "One SKU for more than one product" (reporter's suggestion)

**Verdict: IMPOSSIBLE — confirmed refuted.**

`apps/store-api/prisma/schema.prisma` (lines 99, 129, 140):

```
model Product      { sku String? @unique }
model ProductVariant { sku String? @unique; @@index([sku]) }
```

Both `Product.sku` and `ProductVariant.sku` carry `@unique` constraints enforced at the database
level. A single SKU value literally cannot belong to more than one product or more than one
variant. The reporter's attribution ("possibly because 1 SKU exists for > 1 product") is a
misdiagnosis of what they observed.

### Hypothesis B: "Wrong product opens via slug collision"

**Verdict: Impossible — confirmed refuted.**

`apps/store-client/src/shared/ui/product-card.tsx` (line 56) links:

```tsx
href={`/products/${product.slug}`}
```

`apps/store-api/prisma/schema.prisma` (line 95): `Product.slug String @unique`

The slug is unique at the DB level. The PDP fetches by slug
(`useProductControllerFindBySlug(slug)`). A literal "wrong product" cannot open.

### Hypothesis C (real cause — Symptom 1): Product-level sale badge vs. PDP first-active variant

**Verdict: Confirmed. This is the actual cause of the perceived wrong-variant.**

**Card side** (`apps/store-client/src/shared/ui/product-card.tsx` lines 33–35):

```tsx
const onSale =
  product.compareAtPrice != null &&
  Number(product.compareAtPrice) > Number(product.price);
```

The card reads `product.compareAtPrice` and `product.price` — both **product-level** fields from
the list endpoint `ProductEntity`. The list endpoint does NOT return variant data (confirmed:
`apps/store-api/src/product/entities/product.entity.ts` lines 122–147 — `fromPrisma` maps only
`primaryImage`, not variants). The card badge therefore reflects the product-level sale discount,
which equals the _base_ product price vs the compare-at price, regardless of which variant is
cheapest or which variant's price is actually discounted.

**PDP side** (`apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`
lines 63–65):

```tsx
const defaultVariantId =
  variants.find((variant) => variant.isActive)?.id ?? null;
```

The PDP backend (`apps/store-api/src/product/product.repository.ts` lines 173–176):

```ts
variants: {
  where: { isActive: true },
  orderBy: { name: 'asc' },
```

Variants are returned ordered by `name` ascending. The PDP therefore defaults to the variant
whose name sorts first alphabetically — `"1m / White"`, `"Black"`, `"Clear"`, `"Double Pack"`,
etc. This has no relation to which variant carries a lower price or is "on sale."

**The seed data** (`apps/store-api/prisma/seed.ts` lines 183–209) confirms: "Silicone Case for
iPhone 15" has variants `Black / Blue / Red / White`, all priced at `12.99` except `Red` at
`14.99`. The product's base `price` is `12.99` and `compareAtPrice` is `19.99`, so the card
shows a sale badge. But `variants.find(v => v.isActive)` sorted by name returns "Black" (not
"Red", not the highest-priced one). The user sees the Black variant price `12.99` on the PDP —
same as the base price — and the PDP's `onSale` check compares against `product.compareAtPrice`,
so the sale badge _is_ still shown on the PDP for this particular product. However, for products
where the sale lives only in a specific variant (lower `variant.price` vs `product.price`), and
the alphabetically-first variant does not hold that lower price, the PDP appears to "not be on
sale." The reporter's experience is: clicked a card that showed `−35%`, PDP opened on a variant
that looked different. This is the concrete failure mode.

**Additional concern in `ProductVariantSelector`** (`product-variant-selector.tsx` line 41):

```tsx
const showPrice = variant.price !== basePrice;
```

This hides a variant's price when it equals the base product price. So if multiple variants share
the base price, their prices are hidden, making the selection UI ambiguous about which variant is
cheaper. The user has to know to click through variants to find the discounted one.

### Hypothesis D (Symptom 2): No thumbnail strip — `images.length > 1` gate

**Verdict: Confirmed as the primary gate, compounded by data.**

`apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` (lines 58–96):

```tsx
{
  images.length > 1 && <ul className="flex gap-2 overflow-x-auto">...</ul>;
}
```

The strip only renders when there are at least 2 images. This is intentional UX — a single image
does not need a strip; showing one thumbnail that is just the main image would be redundant.
**The gate itself is correct design, not a bug.**

The real issue is the image data:

- Seed (`apps/store-api/prisma/seed.ts` lines 667–683): the seed script always writes
  `picsum.photos` URLs dynamically generated per slug+sortOrder:
  `https://picsum.photos/seed/${p.slug}-${img.sortOrder}/800/800`
- Most seeded products define only **1 image entry** (sortOrder 0). Only "Silicone Case for
  iPhone 15" has 2 image entries (sortOrder 0 and 1), which would produce a 2-image gallery.
- `apps/store-client/public/` exists but is empty — there is NO `images/products/` directory.
  However, the current seed already uses `picsum.photos` absolute URLs (not local paths), so
  images themselves should load from picsum, not from local files.
- The reporter's observation of "no thumbnails" is therefore explained purely by the
  `images.length > 1` gate: the clicked product had exactly 1 seeded image, so no strip appears.
  The main image renders fine (picsum URL resolves). The placeholder fallback (`onError`) only
  fires if the picsum CDN is unreachable.

**Conclusion on Symptom 2:** The missing thumbnails are a **data gap** (most products seeded with
only 1 image) rather than a render bug. The `images.length > 1` gate is correct. The fix is
seeding 2–3 images per product, which belongs to TASK-128 (seed overhaul). The render code for
the gallery strip is correct. No code change is required for the strip itself.

**TASK-073 note** (product images — plan 041, ✅): The admin upload path is implemented and
images uploaded via the admin panel would work in the gallery. The reporter tested on seed data
only, which has 1 image per product. No production bug in the gallery component.

### Summary of confirmed root causes

| Symptom                       | Reporter's hypothesis   | Actual root cause                                                                                           |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Wrong variant / sale mismatch | "1 SKU for > 1 product" | Product-level sale badge on card vs. alphabetically-first active variant as PDP default                     |
| No thumbnails                 | "Only 1 image"          | Correct — `images.length > 1` gate with most products seeded with 1 image. Seed data gap, not a render bug. |

---

## Scope

### In Scope (TASK-126)

- Fix the variant-mismatch / sale disagreement: change PDP default-variant selection to
  prefer the variant with the lowest price (or the variant whose price equals the product base
  price — i.e., the variant the card advertised). Add acceptance tests for the new selection logic.
- Extend `product-image-gallery.test.ts` with additional behavioral cases.
- Add a component test for `ProductDetailView` confirming the default-variant selection.
- Document the confirmed root causes and recommendation in this plan (done).

### Out of Scope (deferred)

- **TASK-128** — Seed overhaul: adding 2–3 images per product so the thumbnail strip is
  exercisable by QA with seed data. The strip code is correct; no code change needed here.
- **TASK-077** — Variant dots / card-level variant deep-linking (card advertises a specific
  variant id via `?variant=<id>` deep-link). This is a future enhancement: the recommendation
  below is a simpler fix that does not require changing the API contract.
- Prisma schema migration — not required. No schema changes.
- Orval regeneration — not required. No API contract changes.
- Backend changes — not required. The repository already returns variants sorted by name; we
  change only the frontend selection strategy.

---

## Technical Design

### Fix: PDP default-variant selection strategy

**Recommended approach: prefer the variant with the lowest price.**

Rationale:

- The card advertises `product.price` (the base/lowest price) vs `product.compareAtPrice`.
  The base price is typically the cheapest variant price, set at product creation.
- A shopper clicking a card showing price `12.99` and a `−35%` badge expects to land on a
  variant priced `12.99`. Selecting the cheapest active variant as the default satisfies this
  expectation in the general case.
- This requires no API change — the PDP already receives full variant data from the detail
  endpoint (price included).
- It is simpler than a card deep-link approach (which would require: card list endpoint to
  expose a "lowest-price variant id", changes to `product-card.tsx` Link href, PDP to read
  `?variant=` query param, and Orval regen for a changed list response).

**Alternative considered: deep-link via `?variant=<id>`**

- Requires the list API to expose a `cheapestVariantId` or `defaultVariantId` field.
- Requires `product-card.tsx` to include it in the `href`.
- Requires `ProductDetailView` to read the URL search param and override `selectedVariantId`.
- More code surface but gives more explicit control per card. Deferred to TASK-077 as part of
  variant dots / quick-add work.

**Selection logic change** in `product-detail-view.tsx`:

Current (line 63–64):

```tsx
const defaultVariantId =
  variants.find((variant) => variant.isActive)?.id ?? null;
```

New:

```tsx
// Prefer the active variant with the lowest price so the PDP default matches
// the price advertised on the product card (which uses product.price = base price).
const defaultVariantId = useMemo(() => {
  const active = variants.filter((v) => v.isActive);
  if (active.length === 0) return null;
  return active.reduce((cheapest, v) =>
    Number(v.price) < Number(cheapest.price) ? v : cheapest,
  ).id;
}, [variants]);
```

Note: `defaultVariantId` must be computed inside a `useMemo` (variants already has a `useMemo`
above; extract or combine). Because `selectedVariantId` starts `null`, the effective variant
is `selectedVariantId ?? defaultVariantId`, so user picks override the default correctly.

### Fix: No change needed in gallery

The `images.length > 1` gate in `product-image-gallery.tsx` is correct design. The main image
renders for a single-image product. The fix for "no thumbnails visible in QA" is seeding multiple
images (TASK-128). No render code changes are required.

The existing `product-image-gallery.test.ts` only tests the `altText` helper. It should be
extended with behavioral tests for the strip visibility gate (covered in TASK-126-D).

### Files to modify

| File                                                                                 | Change                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`            | Change `defaultVariantId` computation to select cheapest active variant     |
| `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.test.ts`      | Add strip-visibility and single-image behavioral tests                      |
| `apps/store-client/src/widgets/product-detail/ui/product-detail-view.test.tsx` (new) | Component test for default-variant selection (cheapest), user-override path |

No backend files. No Prisma migration. No Orval regen.

---

## User Stories

1. As a shopper, when I click a product card that shows a sale price, I want the PDP to open
   with the cheapest/sale-priced variant pre-selected, so I do not have to search through variants
   to find the advertised deal.
2. As a shopper, I want to see a thumbnail strip when a product has multiple images, so I can
   browse angles and see the product clearly.

---

## Tasks

### TASK-126-A: Confirm and document root causes (investigation)

**Type:** docs
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] Read `product-card.tsx`, `product-detail-view.tsx`, `product.repository.ts`, `seed.ts`,
      `schema.prisma` — confirm all findings in this plan's Investigation section.
- [ ] Confirm SKU uniqueness hypothesis is refuted (`@unique` constraints present on both
      `Product.sku` and `ProductVariant.sku`).
- [ ] Confirm slug uniqueness hypothesis is refuted (`Product.slug @unique`).
- [ ] Confirm the actual wrong-variant cause: product-level `compareAtPrice` on card vs.
      alphabetically-first active variant on PDP.
- [ ] Confirm the gallery strip gate (`images.length > 1`) is correct and that the data gap
      (1 image per product in seed) is the cause — no render bug.
- [ ] Confirm seed already uses picsum.photos absolute URLs (not missing local file paths).
- [ ] This plan document serves as the deliverable. No code change in this sub-task.

**Files to read (not modify):**

- `apps/store-client/src/shared/ui/product-card.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx`
- `apps/store-api/src/product/product.repository.ts`
- `apps/store-api/prisma/seed.ts`
- `apps/store-api/prisma/schema.prisma`

---

### TASK-126-B: Fix PDP default-variant selection (cheapest active variant)

**Type:** fix
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No (component test written separately in TASK-126-D)
**Depends on:** TASK-126-A

**Acceptance Criteria:**

- [ ] `defaultVariantId` in `product-detail-view.tsx` is computed via a `useMemo` that picks the
      active variant with the numerically lowest `price`.
- [ ] When all active variants share the same price, the result is still a valid variant id (any
      of the tied variants is acceptable — consistent tie-breaking is not required).
- [ ] When there are no active variants, `defaultVariantId` is `null` and the PDP shows the
      base product price.
- [ ] The `effectiveVariantId = selectedVariantId ?? defaultVariantId` pattern is preserved,
      so a user click still overrides the default.
- [ ] `displayPrice = selectedVariant?.price ?? product.price` is unchanged — falls back to
      product price when no variant selected.
- [ ] `npm run lint -w apps/store-client` passes.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — change
  `defaultVariantId` to pick cheapest active variant via `useMemo`.

---

### TASK-126-C: Confirm gallery strip design intent — no code change

**Type:** docs
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-126-A

**Acceptance Criteria:**

- [ ] `product-image-gallery.tsx` `images.length > 1` gate is confirmed as intentional design
      (documented in this plan). No code change needed.
- [ ] A note is added to the TASK-128 entry in `BACKLOG.md` (or this plan) stating that seeding
      2–3 images per product will make the strip exercisable by QA. (TASK-128 already exists.)
- [ ] This sub-task is complete when TASK-126-A findings are written and TASK-128 dependency
      is noted — no file changes required here.

**Files to read (not modify):**

- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx`

---

### TASK-126-D: Tests — gallery behavioral coverage + PDP default-variant component test

**Type:** test
**Scope:** store-client
**Complexity:** M (2–4h)
**TDD Required:** Yes (write tests before/alongside TASK-126-B implementation)
**Depends on:** TASK-126-A (read code first); TASK-126-B (tests must pass after fix)

**Acceptance Criteria:**

- [ ] `product-image-gallery.test.ts` (extend existing file) adds:
  - `images.length === 0` → no strip rendered, placeholder shown.
  - `images.length === 1` → no strip rendered, main image shown (the current `altText` tests
    pass; new test asserts the `<ul>` is absent).
  - `images.length > 1` → strip rendered with correct number of `<button>` thumbnails.
  - Clicking a thumbnail calls the selection change (activeIndex updates).
  - `onError` path: a failed image marks it failed and shows `ProductThumb` instead.
- [ ] New file `product-detail-view.test.tsx`:
  - With variants `[{ name: "Blue", price: "12.99" }, { name: "Red", price: "14.99" }]` (both
    active, Blue alphabetically first but Red more expensive) → default selected variant is Blue
    (cheapest, `12.99`).
  - With all variants same price → a variant is selected (not null).
  - With no active variants → `defaultVariantId` is null; ATC button falls back.
  - User clicks a different variant → `selectedVariantId` overrides the default; price updates.
- [ ] `npm run test -w apps/store-client` green (all existing + new tests pass).
- [ ] `npm run lint -w apps/store-client` passes.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.test.ts` — extend with
  strip-visibility, interaction, and error-fallback behavioral cases.
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.test.tsx` — new component
  test using RTL + MSW (following pattern from `register-form.test.tsx` in TASK-121/105).

**Testing approach:**

The gallery test can remain a logic/unit test (no DOM needed for the strip-count assertions if
extracted as pure logic; otherwise use RTL with a light render). For `ProductDetailView`, use
MSW to mock `GET /api/products/:slug` returning controlled variant/image data (same MSW handler
pattern as TASK-121/105 `src/shared/test/`).

---

### TASK-126-E: Manual QA checklist

**Type:** test
**Scope:** store-client (running stack)
**Complexity:** S (30min on running stack)
**TDD Required:** No
**Depends on:** TASK-126-B, TASK-126-D

**Acceptance Criteria (manual, on running stack):**

Maps directly to QA master `docs/manual-qa-master.md` line 207–211 (item A1):

- [ ] Open `/products` → find a product with a sale badge (e.g., "Silicone Case for iPhone 15"
      which has `compareAtPrice: 19.99`, `price: 12.99`).
- [ ] Click the product card → PDP opens on the variant with the lowest price (e.g., "Black" or
      "White" at `12.99`, NOT "Red" at `14.99` which sorts last alphabetically but is pricier).
- [ ] The sale badge (`−35%`) and struck-through compare-at price are visible on the PDP for the
      pre-selected variant.
- [ ] Select a different variant (e.g., "Red" at `14.99`) → price updates to `14.99`; the sale
      badge recalculates or disappears correctly (depends on whether `14.99 < 19.99` — it does, so
      badge persists; verify the `onSale` logic with the variant's price, not a stale value).
- [ ] On a product with 1 seeded image (most products): no thumbnail strip appears — this is
      correct and expected behaviour. The main image renders correctly from picsum.photos.
- [ ] On "Silicone Case for iPhone 15" (2 seeded images): thumbnail strip appears with 2 buttons;
      clicking the second thumbnail swaps the main image.
- [ ] Console (F12) has no red errors on the PDP.
- [ ] Mark `docs/manual-qa-master.md` item A1 (line 207) as ✅ when all above pass.

---

## Migration Steps

No Prisma migration. No Orval regeneration. No backend change.

1. Complete TASK-126-A (read + confirm all findings — already done in this plan document).
2. TASK-126-D (write failing tests first — TDD Red): write the PDP default-variant test
   asserting cheapest variant is selected; it will fail against the current alphabetical-first
   logic. Write gallery strip behavioral tests.
3. TASK-126-B (TDD Green): implement the cheapest-variant `useMemo` in `product-detail-view.tsx`;
   tests go green.
4. TASK-126-C (confirm, document, no code): note strip design intent + TASK-128 dependency.
5. Run gates: `npm run test -w apps/store-client`, `npm run lint -w apps/store-client`,
   `npm run typecheck -w apps/store-client`.
6. TASK-126-E: Manual QA on a running stack; update `docs/manual-qa-master.md` A1 to ✅.

---

## Scope Coordination Notes

### TASK-073 (Product Images — plan 041, ✅ complete)

The admin image upload and storefront display are fully shipped. Images uploaded via the admin
panel appear in the gallery strip when there are ≥2 images. TASK-126 does not touch image upload
or display code. The "no thumbnails" QA observation is entirely explained by seed data having 1
image per product, not by any defect in the shipped TASK-073 code.

### TASK-128 (Seed overhaul — ⬜ to do)

TASK-128 should add 2–3 picsum.photos image entries per product so QA can exercise the thumbnail
strip on seed data. The strip renders correctly — it just needs more than 1 image in the DB.
TASK-126 does not touch the seed. Coordinate: run TASK-126-E manual QA on a stack where TASK-128
has been applied for the fullest coverage.

### TASK-077 (Variant dots + quick-add — ⬜ parked)

A deeper card→PDP variant deep-link (via `?variant=<id>` URL param) is considered and deferred
to TASK-077. That approach requires the list API to expose a `cheapestVariantId` field (backend
change, Orval regen, card href change, PDP URL param read). The TASK-126-B fix (PDP-side cheapest
selection) is simpler, has zero API surface change, and resolves the reported UX defect.

---

## Risks and Mitigations

| Risk                                                                                                                                                                     | Mitigation                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cheapest variant" may not always be the most relevant default (e.g., a product where the featured variant is mid-priced)                                                | Product managers can set `product.price` to match the most-advertised variant; the card always shows `product.price` anyway. The cheapest default is the most defensible for a sale-badge context. |
| If all variant prices equal `product.price`, the PDP sale badge compares `product.compareAtPrice > product.price` — this already works correctly in current code         | No change needed; `displayPrice = selectedVariant?.price ?? product.price` and `product.price === selectedVariant.price` so sale detection is stable.                                              |
| `ProductVariantSelector` hides price when `variant.price === basePrice` — all same-price variants show no price label, making the selector look like color swatches only | Acceptable for MVP; label the selector `chooseVariant` (already done). If confusing, a later pass adds explicit price display always.                                                              |
| Picsum.photos CDN outage causes all PDP images to show the placeholder                                                                                                   | Acceptable for dev seed; production images are uploaded via admin (TASK-073).                                                                                                                      |

---

## Notes

- `ProductVariantSelector` (`product-variant-selector.tsx` line 41) hides variant price when
  `variant.price !== basePrice`. This means the cheapest variant (which equals the base price)
  shows no price label — only the more-expensive variants show their price as a delta. This is
  intentional and consistent with the card-card matching behaviour (card shows `product.price`
  which equals the cheapest variant).
- No `data` vs `data.data` confusion: `product-detail-view.tsx` line 58–59 correctly reads
  `const product = data.data` and `const { category } = data` (the endpoint wraps the product
  in `{ data, category, variants, images }`). This is not related to the bug.
- Prisma migration: **not required**. No schema field was changed or added.
- Orval regeneration: **not required**. No Swagger-decorated controller or DTO was modified.
- The `data` object read as `data?.variants` (line 34) means variants come from the detail
  endpoint's top-level `variants` key, not from `data.data.variants` — the controller response
  shape must be confirmed when writing the MSW handler in TASK-126-D.
