# Plan 080 — Cart line images + product links (TASK-133)

**Phase:** Phase 3 / Tier 3 UX polish — Wave 2 (frontend only)
**Roadmap context:** Unblocked after TASK-158 prep branch merges to `develop`; depends on `CartItemEntity` gaining `productSlug` and `imageUrl` (see `docs/plans/076-line-item-contract.md`).
**Branch:** `feat/133-cart-images-links` (branched from `develop` AFTER TASK-158 merges)
**Created:** 2026-06-29
**Status:** ⬜ To Do
**BLOCKED BY:** TASK-158 — the `CartItemEntity` Orval-generated type does not carry `productSlug` or `imageUrl` until that prep branch merges and `generate:api` is re-run. Do not start coding this branch before that merge.
**Agent:** `designer` (visual polish, FSD storefront layer; see `CLAUDE.md` agent notes)

---

## Problem Statement

Every cart line in `cart-item-row.tsx` displays a gradient initial placeholder
(`ProductThumb`) instead of the product's real image, and the product name is plain
text with no link to the product detail page (PDP). Customers who want to confirm
what they have in their cart must navigate away manually. Two improvements are needed:

1. **Real product thumbnail** — replace `ProductThumb` with the primary image returned
   by the API (`imageUrl`), with a graceful fallback to `ProductThumb` when `imageUrl`
   is `null` (product has no images) or when the image URL fails to load.
2. **PDP link** — wrap the thumbnail + product name in a `<Link>` pointing to
   `/products/{productSlug}` so customers can jump from the cart directly to the PDP.

The storefront must NOT fetch product-by-id to obtain the image or slug — that
endpoint (`GET /products/admin/:id`) is `AdminGuard`-protected. After TASK-158, both
fields arrive directly on each `CartItemEntity` line item.

---

## Investigation Findings

### `cart-item-row.tsx` — current structure

`apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` renders each cart line as
an `<li>` with two inner rows:

**Row 1** (product info + line total, line 149–173):

```
<div class="flex items-start justify-between gap-4">   ← outer
  <div class="flex items-start gap-3">                 ← left side (thumb + name)
    <ProductThumb name={item.productName}
                  className="size-16 shrink-0 rounded-lg"
                  initialClassName="text-xl" />
    <div class="flex flex-col">
      <p class="font-medium text-foreground">{item.productName}</p>
      <!-- price + compareAt price -->
    </div>
  </div>
  <p class="shrink-0 font-semibold">{formatMoney(item.lineTotal)}</p>  ← line total
</div>
```

**Row 2** (qty stepper + remove button, lines 175–219):

```
<div class="flex items-center justify-between gap-4">
  <!-- qty stepper: − / input / + -->
  <!-- remove button -->
</div>
```

The qty controls and remove button live in a **sibling** `<div>`, not inside the
thumbnail/name area. This means a `<Link>` can safely replace the inner `<div
class="flex items-start gap-3">` without creating nested interactive elements — the
stepper and remove button are outside the link's subtree.

### `ProductThumb` — what it renders

`apps/store-client/src/shared/ui/product-thumb.tsx`:

- A `<div aria-hidden="true">` with a deterministic CSS gradient seeded from the
  product name and the product's uppercase initial letter as text.
- Purely decorative — no interactive elements, no accessible text of its own.
  Callers provide visible text alongside it (`item.productName` paragraph).
- Props consumed by the cart row: `name`, `className="size-16 shrink-0 rounded-lg"`,
  `initialClassName="text-xl"`.

### `ProductImageGallery` — the existing image pattern

`apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` uses a
bare `<img>` element (not `next/image`) with an `onError` handler to track failed
images and fall back to `ProductThumb`. A deliberate ESLint-disable comment in that
file documents the reason:

```
/* eslint-disable-next-line @next/next/no-img-element
   -- Next <Image> deferred to Phase 5 (needs dimensions + CDN) */
```

`apps/store-client/next.config.ts` confirms this: there are **no** `images.remotePatterns`
configured. `next/image` requires `remotePatterns` to serve external URLs; without
them any external `src` throws a configuration error at runtime. This plan therefore
uses the same bare-`<img>` pattern with `onError` fallback — consistent with the PDP
gallery, no extra config needed, and TASK-042 (`docs/plans/042-image-optimization.md`)
is the designated future task for migrating both galleries to `next/image` with CDN.

### `next/image` / `remotePatterns` status

Not configured. Using `<img>` (with ESLint disable comment) is the correct and
consistent approach for this task. Cross-reference TASK-042 for the future migration.

### PDP route

`apps/store-client/src/app/products/[slug]/page.tsx` confirms the PDP is at
`/products/[slug]`. The Link target is `/products/${item.productSlug}`.

### `CartItemEntity` fields after TASK-158 / Orval regen

After TASK-158 (`docs/plans/076-line-item-contract.md`) merges and `generate:api` is
run, the generated `CartItemEntity` type gains:

| Field         | Type             | Source                                                |
| ------------- | ---------------- | ----------------------------------------------------- |
| `productSlug` | `string`         | `product.slug` from `CART_ITEMS_INCLUDE`              |
| `imageUrl`    | `string \| null` | `product.images[0]?.url ?? null` — primary image only |

`stock` is retained on `CartItemEntity` (the qty stepper caps at it); it is not
displayed as a number. These are the only two new fields used by TASK-133.

### Existing dictionary keys (cart namespace)

`apps/store-client/src/shared/config/dictionary.ts` already has:
`removeItemAria`, `removeNamedAria`, `decreaseAria`, `increaseAria`, `quantityAria`,
`remove`, `updateError`. No image-or-link key exists yet. One key should be added so
tests can use `dict.*` patterns consistently (see TASK-133-B).

### Test factory — `makeCartItem`

`apps/store-client/src/shared/test/msw-handlers.ts: makeCartItem` builds a
`CartItemEntity` fixture. It does not yet include `productSlug` or `imageUrl`
because those fields do not exist on the generated type before TASK-158. After
TASK-158's Orval regen, `CartItemEntity` will require these fields; `makeCartItem`
must be updated with sensible defaults so all existing tests continue to compile.

### Existing test file

`apps/store-client/src/widgets/cart/ui/cart-item-row.test.tsx` uses MSW+RTL and
covers qty mutations, remove, error state, optimistic update, debounce collapse, and
stock-cap. All existing tests must continue to pass unchanged; new tests are added for
the image and link behaviour.

### TASK-134 relationship

TASK-134 (`order-details page — fix layout + link items`) applies the same image +
PDP-link pattern to order line items (`order-item-list.tsx`), using `imageUrl` +
`productSlug` from `OrderItemEntity`. The implementation is in a separate file and a
separate branch (`feat/134-order-details`), but the two should use identical markup
patterns (bare `<img>` + `onError` + `ProductThumb` fallback; `<Link>` wrapper). When
TASK-133 is reviewed, note the pattern for TASK-134 to follow.

---

## Recommended Approach

### Image rendering

Introduce a single piece of local state in `CartItemRow`:

```typescript
const [imgFailed, setImgFailed] = useState(false);
const showThumb = !item.imageUrl || imgFailed;
```

Replace the `<ProductThumb>` JSX with:

```tsx
{
  showThumb ? (
    <ProductThumb
      name={item.productName}
      className="size-16 shrink-0 rounded-lg"
      initialClassName="text-xl"
    />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element -- see product-image-gallery.tsx; next/image deferred to TASK-042 */
    <img
      src={item.imageUrl!}
      alt={item.productName}
      onError={() => setImgFailed(true)}
      className="size-16 shrink-0 rounded-lg object-cover"
    />
  );
}
```

The `alt` attribute uses `item.productName` — same fallback strategy as
`ProductImageGallery`. The `!` non-null assertion is safe because `showThumb` guards
the `null` case. The image state must reset when the item changes (slug or imageUrl),
which the render-guard sync pattern already in the component handles for quantity;
`imgFailed` should be reset via a `useEffect` keyed on `item.productSlug` (or set
during render if the component is always remounted per item — which it is, since items
are rendered from a list keyed by `item.id`).

### Link wrapper

Replace the inner `<div className="flex items-start gap-3">` with:

```tsx
<Link
  href={`/products/${item.productSlug}`}
  aria-label={dict.cart.viewProductAria(item.productName)}
  className="flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
>
  {/* image or thumb */}
  <div className="flex flex-col">
    <p className="font-medium text-foreground">{item.productName}</p>
    {/* prices */}
  </div>
</Link>
```

Using an explicit `aria-label` (e.g. `"Переглянути «iPhone 15 Pro Case»"`) disambiguates
the link for screen-reader users who might otherwise hear the concatenated alt text +
product name + price as the link label. The `focus-visible:ring-2` guard ensures
keyboard focus is visible on the link block.

The line-total `<p>` stays outside the link (sibling in the outer
`flex items-start justify-between` div) so it is not accidentally part of the
interactive area.

### Interaction safety — no nested interactive elements

Row 2 (qty stepper + remove button) is a sibling `<div>`, not a descendant of the
Link. Pressing Tab moves focus: Link → decrease button → qty input → increase button
→ remove button. No ARIA violations.

---

## Migration / schema impact

None. No Prisma changes. No API changes (TASK-158 handles the backend side). No Orval
schema modifications (TASK-133 only consumes the newly generated fields). No changes
to `next.config.ts`.

---

## Tasks

### TASK-133-A: Prerequisite sync — Orval regen and test factory update

**Type:** chore
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-158 (must be merged to `develop` before this branch starts)

**Acceptance Criteria:**

- [ ] `develop` is pulled into the `feat/133-cart-images-links` worktree after TASK-158
      merges.
- [ ] `npm run generate:api` (or root `generate:api`) runs without errors and
      regenerates `apps/store-client/src/shared/api/generated/`.
- [ ] The generated `CartItemEntity` type includes `productSlug: string` and
      `imageUrl: string | null` (verify in the generated models file).
- [ ] `makeCartItem` in `apps/store-client/src/shared/test/msw-handlers.ts` is updated
      to include default values for the two new fields:
  - `productSlug: "iphone-15-pro-case-clear"` (a valid slug string)
  - `imageUrl: "https://example.com/images/iphone-15-case.jpg"` (a non-null default)
- [ ] All existing `cart-item-row.test.tsx` tests compile and pass after the factory
      update: `npm run test -w apps/store-client` — no regressions.
- [ ] `npm run typecheck -w apps/store-client` clean after regen.
- [ ] Generated files are not staged for commit (gitignored per project convention).

**Files to create/modify:**

- `apps/store-client/src/shared/test/msw-handlers.ts` — add `productSlug` and
  `imageUrl` to `makeCartItem` defaults
- `apps/store-client/src/shared/api/generated/` — regenerated (gitignored, not
  committed)

---

### TASK-133-B: `cart-item-row.tsx` — image thumbnail + PDP link + dictionary key

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-133-A

**Acceptance Criteria:**

- [ ] `dict.cart.viewProductAria` added to `apps/store-client/src/shared/config/dictionary.ts`:
  - Key: `viewProductAria: (name: string) => \`Переглянути «${name}»\``
  - Position: after `quantityAria` in the `cart:` block.
- [ ] `CartItemRow` imports `Link` from `next/link`.
- [ ] `CartItemRow` introduces local state `const [imgFailed, setImgFailed] = useState(false)`.
- [ ] `const showThumb = !item.imageUrl || imgFailed` derived from state + prop.
- [ ] The `ProductThumb` JSX is replaced with a conditional:
  - When `showThumb === true`: render `<ProductThumb name={item.productName} className="size-16 shrink-0 rounded-lg" initialClassName="text-xl" />`.
  - When `showThumb === false`: render a bare `<img src={item.imageUrl!} alt={item.productName} onError={() => setImgFailed(true)} className="size-16 shrink-0 rounded-lg object-cover" />` with an ESLint-disable-next-line comment (same pattern as `product-image-gallery.tsx`).
- [ ] The inner `<div className="flex items-start gap-3">` (wrapping thumb + name column)
      is replaced with `<Link href={\`/products/${item.productSlug}\`}
      aria-label={dict.cart.viewProductAria(item.productName)}
      className="flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">`.
- [ ] The line-total `<p>` (formatMoney of lineTotal) remains outside the link, as a
      sibling in the outer `flex items-start justify-between` div.
- [ ] Row 2 (qty stepper + remove button) is unchanged and remains a sibling div — no
      interactive elements are nested inside the new `<Link>`.
- [ ] `ProductThumb` import from `@/shared/ui` is retained (still needed for fallback).
- [ ] `dict` import already present; no new imports needed beyond `Link`.
- [ ] No TypeScript errors: `npm run typecheck -w apps/store-client`.
- [ ] No ESLint errors: `npm run lint -w apps/store-client`.
- [ ] Build succeeds: `npm run build -w apps/store-client`.

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — add `cart.viewProductAria`
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` — image + link implementation

---

### TASK-133-C: RTL+MSW tests — image rendered, link href, null fallback

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (no critical business logic; RTL assertions on render behaviour)
**Depends on:** TASK-133-A, TASK-133-B

**Acceptance Criteria:**

- [ ] Four new test cases added to `cart-item-row.test.tsx`:

  **Case 1 — image renders when `imageUrl` is provided:**

  ```
  makeCartItem({ imageUrl: "https://example.com/img.jpg", productSlug: "test-slug" })
  → screen.getByRole("img", { name: "Test Product" }) has src "https://example.com/img.jpg"
  ```

  **Case 2 — link points to the correct PDP URL:**

  ```
  makeCartItem({ productSlug: "iphone-case", productName: "iPhone Case" })
  → screen.getByRole("link", { name: dict.cart.viewProductAria("iPhone Case") })
      has href "/products/iphone-case"
  ```

  **Case 3 — `ProductThumb` renders when `imageUrl` is null:**

  ```
  makeCartItem({ imageUrl: null, productName: "No-image Product" })
  → no <img> with alt "No-image Product" in the DOM
  → the gradient placeholder block is rendered (query by aria-hidden container or
    check screen.queryByRole("img") is null)
  ```

  **Case 4 — `ProductThumb` fallback renders on image load error:**

  ```
  makeCartItem({ imageUrl: "https://example.com/bad.jpg", productName: "Broken Image" })
  → render, then fireEvent.error(screen.getByRole("img", { name: "Broken Image" }))
  → screen.queryByRole("img", { name: "Broken Image" }) is removed from DOM
  ```

- [ ] All existing tests (qty stepper, remove, error alert, optimistic, debounce,
      stock-cap) continue to pass without modification.
- [ ] `npm run test -w apps/store-client` — all tests green.
- [ ] `npm run typecheck -w apps/store-client` clean.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.test.tsx` — four new test cases
  appended; no modifications to existing cases

---

## Execution Order

```
TASK-158 merges to develop (prerequisite — not this branch)
          ↓
TASK-133-A  (Orval regen + factory update; branch created, tests compiled)
          ↓
TASK-133-B  (core implementation: image + link + dictionary)
          ↓
TASK-133-C  (RTL+MSW tests for the new behaviour)
```

TASK-133-B and TASK-133-C can be partially overlapped (write tests while the
implementation is in flight), but TASK-133-A must complete before either starts.

---

## TASK-134 consistency note

TASK-134 (`order-details page — link items to their products`) applies an identical
image + link pattern to `order-item-list.tsx`, using `imageUrl` and `productSlug`
from `OrderItemEntity`. When implementing TASK-133, document the exact markup pattern
(bare `<img>` + `onError` + `ProductThumb` fallback; `<Link>` wrapping image + name)
in the PR description so TASK-134 can copy it verbatim. The dictionary key convention
(`viewProductAria`) should also be reused in the order-items context (or the same key
re-exported from a shared location — deferred to TASK-134 to decide).

---

## Verification (before opening PR)

- [ ] `npm run test -w apps/store-client` — all tests green (existing + 4 new).
- [ ] `npm run typecheck -w apps/store-client` — clean.
- [ ] `npm run lint -w apps/store-client` — clean (including the
      `@next/next/no-img-element` ESLint disable comment present on the `<img>` line).
- [ ] `npm run build -w apps/store-client` — clean build.
- [ ] Manual smoke (running stack): each cart line shows the product's primary image;
      clicking the image or product name navigates to the correct PDP (`/products/{slug}`).
- [ ] Manual smoke: a product with no images shows the gradient `ProductThumb` fallback.
- [ ] Manual smoke: intentionally breaking an image URL (network tab → block) shows
      the fallback after the `onError` fires.
- [ ] Manual smoke: qty stepper (−/+/input) and remove button still function normally;
      Tab order is Link → decrease button → qty input → increase button → remove.
- [ ] Cart mini-summary (if any) unaffected — TASK-133 only touches `cart-item-row.tsx`.

---

## Completion Checklist

- [ ] TASK-133-A: Orval regen run, `makeCartItem` updated, existing tests green
- [ ] TASK-133-B: `cart-item-row.tsx` and `dictionary.ts` updated, build/lint/typecheck green
- [ ] TASK-133-C: 4 new RTL+MSW tests written and passing
- [ ] `BACKLOG.md` TASK-133 → ✅ at merge; plan link updated to this file
- [ ] PR description includes the image+link pattern summary for TASK-134 to follow
