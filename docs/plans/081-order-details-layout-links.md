# Plan 081 — Order-details layout fix + line-item PDP links (TASK-134)

**Phase:** Phase 3 / Tier 3 UX polish — Wave 2 (frontend only)
**Roadmap context:** Storefront order-confirmation page visual polish; unblocked after TASK-158 prep
branch merges to `develop`. Uses `imageUrl` + `productSlug` from the updated `OrderItemEntity`.
**Branch:** `feat/134-order-details` (branched from `develop` AFTER TASK-158 + TASK-131 merge)
**Created:** 2026-06-29
**Status:** ⬜ To Do
**BLOCKED BY:** TASK-158 (`docs/plans/076-line-item-contract.md`) — `OrderItemEntity` does not carry
`productSlug` or `imageUrl` until that prep branch merges and `generate:api` is re-run. Do not start
coding this branch before that merge.
**MUST LAND AFTER:** TASK-131 (`docs/plans/078-storefront-order-cancel.md`) — TASK-131-D adds
`<CancelOrderButton>` into the `order-confirmation-view.tsx` CTA strip. TASK-134 restructures that
same strip as part of the layout fix; clobbering TASK-131's change would silently remove the cancel
button. Either TASK-131 is merged to `develop` before `feat/134-order-details` is created, or the
branch is rebased on `feature/131-storefront-order-cancel`.
**Agent:** `designer` (visual polish, FSD storefront layer; see `CLAUDE.md` agent notes)

---

## User Story

As a customer viewing my order confirmation, I want to see a thumbnail of each item I ordered and
click it to return to the product page, so that I can quickly verify what I purchased and revisit
the product if I want to order again.

---

## Problem Statement

The order-confirmation page (`/orders/[id]/confirmation`) has two visual deficiencies that make it
feel unpolished compared to the cart page:

1. **No thumbnails on order line items** — `order-item-list.tsx` renders each item as plain text
   (`productName` + `qty × price` on the left, `lineTotal` on the right). There is no image
   placeholder, let alone a real product image. After `TASK-133` adds images to cart line items,
   the mismatch with the order-confirmation page becomes visually inconsistent.

2. **No PDP link on line items** — the product name is static text. A customer who wants to
   re-order or share a product has no direct path from the confirmation page to the PDP.

In addition, `order-confirmation-view.tsx` has a layout structure issue: the CTA strip
("Continue shopping" / "Cancel order" from TASK-131) floats below the full 3-column grid on desktop,
spanning under both the content column and the totals sidebar. This is addressed by moving the strip
inside the content column.

The storefront must NOT fetch product-by-id to get the image or slug — `GET /products/admin/:id`
is `AdminGuard`-protected. After TASK-158, both fields arrive directly on each `OrderItemEntity`
line item via `ORDERS_INCLUDE`.

---

## Investigation Findings

### Current `order-item-list.tsx` structure (line-by-line)

```
<section class="flex flex-col gap-4">
  <h2>Замовлені товари</h2>
  <ul class="flex flex-col gap-4">
    {items.map(item =>
      <li class="flex items-start justify-between gap-3 border-b border-border pb-4 text-sm">
        <div class="flex flex-col">
          <span>{item.productName}</span>
          <span class="text-muted-foreground">{item.quantity} × {formatMoney(item.price)}</span>
        </div>
        <span class="font-medium">{formatMoney(item.lineTotal)}</span>
      </li>
    )}
  </ul>
</section>
```

No image column; no link. The component is a server component (no `"use client"` directive).
Adding `useState` for per-item `imgFailed` state requires either adding `"use client"` to the
list file or extracting a dedicated `OrderItemRow` client component.

### Current `order-confirmation-view.tsx` layout

```
<div class="flex flex-col gap-8">                          ← root
  <OrderConfirmationHeader />
  <div class="flex flex-col gap-8 lg:grid lg:grid-cols-3"> ← 3-col grid
    <section class="flex flex-col gap-8 lg:col-span-2">   ← content col (2)
      <OrderItemList />
      <OrderAddressSummary />
    </section>
    <aside class="flex flex-col gap-6 lg:col-span-1 lg:self-start">
      <OrderTotalsBreakdown />
      {notes && <notes card>}
    </aside>
  </div>
  <div class="flex flex-wrap gap-4">                       ← CTA strip (outside grid)
    <Link href="/">{dict.common.continueShopping}</Link>
    {/* TASK-131-D adds <CancelOrderButton> here when status === 'PENDING' */}
  </div>
</div>
```

After TASK-131-D merges, the CTA strip contains both a link and a conditional button.

### Concrete layout problems in `order-confirmation-view.tsx`

**Problem 1 — incorrect semantic element for the content column.**
`<section class="lg:col-span-2">` on line 105 uses a `<section>` element as a grid-column
layout container. A `<section>` must have an associated heading (`<h1>`–`<h6>`) per HTML spec
and WCAG 1.3.1. This outer wrapper has no heading — the headings ("Замовлені товари",
"Адреса доставки") belong to `OrderItemList` and `OrderAddressSummary`, not the wrapper.
Using `<div>` instead eliminates the semantic violation without changing visual output.

**Problem 2 — CTA strip disconnected from content column on desktop.**
The `<div class="flex flex-wrap gap-4">` CTA strip is a sibling of the `lg:grid` block, making it
span the full 3-column grid width on `lg` screens. On desktop the "Continue shopping" and "Cancel
order" buttons appear visually floating below both the item/address content AND the totals sidebar —
a layout that looks awkward, especially with a single-button strip. Moving the strip inside the
content column (`<div lg:col-span-2>`) anchors the CTA buttons directly under the order content:

```
Desktop (lg):
  [OrderItemList]              │ OrderTotalsBreakdown
  [OrderAddressSummary]        │ notes (optional)
  [CTA: Continue / Cancel]     │
```

Mobile (flex-col after this fix):
OrderItemList → OrderAddressSummary → CTA strip → [aside] OrderTotalsBreakdown → notes

On mobile, seeing the CTA before the totals is acceptable here: the customer already reviewed
totals in checkout; the "Continue shopping" / "Cancel" actions are not total-dependent.

### `OrderItemRow` extraction decision

`order-item-list.tsx` renders items via `.map()`. Because each row needs its own `imgFailed`
boolean state (resetting when the item's image URL changes), the correct approach is to extract a
dedicated `OrderItemRow` client component rather than adding `"use client"` to `order-item-list.tsx`
itself. This mirrors the `cart-item-row.tsx` pattern: a stateless list component renders a stateful
row sub-component.

`order-item-list.tsx` remains a server component (no hooks). `OrderItemRow` is new and carries
`"use client"` + `useState`.

### Image pattern (identical to TASK-133 / `cart-item-row.tsx`)

TASK-133 (`docs/plans/080-cart-line-images-links.md`) established the approved pattern:

```tsx
const [imgFailed, setImgFailed] = useState(false);
const showThumb = !item.imageUrl || imgFailed;

{
  showThumb ? (
    <ProductThumb
      name={item.productName}
      className="size-16 shrink-0 rounded-lg"
      initialClassName="text-xl"
    />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element
     -- Next <Image> deferred to TASK-042 (needs dimensions + CDN remotePatterns) */
    <img
      src={item.imageUrl!}
      alt={item.productName}
      onError={() => setImgFailed(true)}
      className="size-16 shrink-0 rounded-lg object-cover"
    />
  );
}
```

`next/image` is not used because `next.config.ts` has no `images.remotePatterns` configured.
TASK-042 (`docs/plans/042-image-optimization.md`) is the designated migration task. The
ESLint-disable comment (same wording as `product-image-gallery.tsx`) documents the reason.

### `OrderItemEntity` fields after TASK-158 / Orval regen

After TASK-158 merges and `generate:api` is run:

| Field         | Type             | Source                                                |
| ------------- | ---------------- | ----------------------------------------------------- |
| `productSlug` | `string`         | `product.slug` from `ORDERS_INCLUDE`                  |
| `imageUrl`    | `string \| null` | `product.images[0]?.url ?? null` — primary image only |

### Shared-file conflict: `order-confirmation-view.tsx` and TASK-131

TASK-131-D (`docs/plans/078-storefront-order-cancel.md`) adds to the CTA strip:

```tsx
{
  order.status === "PENDING" && <CancelOrderButton orderId={order.id} />;
}
```

This import and conditional render must be preserved when TASK-134-D restructures the layout.
When `feat/134-order-details` is created, TASK-131 must already be merged to `develop` so the
cancel button code is present in the base. TASK-134's branch then restructures the view without
removing any TASK-131 code — only the DOM parent of the CTA strip changes (moved inside the
content column div from its current position outside the grid).

### `makeOrderItem` factory (`msw-handlers.ts`)

`makeOrderItem` currently builds:

```typescript
{
  (id, productId, productName, quantity, price, lineTotal, createdAt);
}
```

After TASK-158's Orval regen, `OrderItemEntity` gains `productSlug: string` and
`imageUrl: string | null` as required fields. The factory must be updated with sensible defaults
so all existing tests compile and pass:

- `productSlug: "iphone-15-pro-case-clear"`
- `imageUrl: "https://example.com/images/iphone-15-case.jpg"`

### Existing test file (`order-confirmation-view.test.tsx`)

Three existing tests:

1. Renders UA shipping address fields for a fetched order
2. Localizes the country code
3. Redirects unauthenticated visitors

All three use `makeOrder()` which calls `makeOrderItem()`. After the factory update (TASK-134-A),
all three continue to compile. The layout-change assertions in TASK-134-D (moving CTA inside
content column) do not break text-content assertions — the existing tests check for text content
only, not DOM hierarchy.

### PDP route

`apps/store-client/src/app/products/[slug]/page.tsx` confirms the PDP is at `/products/[slug]`.
Link target: `/products/${item.productSlug}`.

### Dictionary: `dict.order.viewProductAria`

TASK-133 adds `dict.cart.viewProductAria: (name: string) => \`Переглянути «${name}»\``to the`cart`namespace. TASK-134 adds a parallel key in the`order` namespace for semantic clarity (the
label text is identical but the namespace places the key with its module):

```typescript
viewProductAria: (name: string) => `Переглянути «${name}»`,
```

Position: after `notFoundBody` in the `order:` block of `dictionary.ts`.

---

## Migration / schema impact

None. No Prisma schema changes. No backend changes. No Orval schema modifications — TASK-134
only consumes newly generated fields from TASK-158.

---

## Tasks

### TASK-134-A: Prerequisite sync — Orval regen and `makeOrderItem` factory update

**Type:** chore
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-158 (must be merged to `develop` before this branch starts); TASK-131 (must
also be merged so `order-confirmation-view.tsx` already contains the cancel button before TASK-134-D
modifies the layout)

**Acceptance Criteria:**

- [ ] `develop` is pulled into the `feat/134-order-details` worktree after both TASK-158 and
      TASK-131 merge.
- [ ] `npm run generate:api` (or root `generate:api`) runs without errors and regenerates
      `apps/store-client/src/shared/api/generated/`.
- [ ] The generated `OrderItemEntity` type includes `productSlug: string` and
      `imageUrl: string | null` (verify in the generated models file).
- [ ] `makeOrderItem` in `apps/store-client/src/shared/test/msw-handlers.ts` is updated to
      include default values for the two new fields:
  - `productSlug: "iphone-15-pro-case-clear"` (a valid slug string)
  - `imageUrl: "https://example.com/images/iphone-15-case.jpg"` (a non-null default)
- [ ] All three existing `order-confirmation-view.test.tsx` tests compile and pass after the
      factory update: `npm run test -w apps/store-client` — no regressions.
- [ ] `npm run typecheck -w apps/store-client` clean after regen.
- [ ] Generated files are not staged for commit (gitignored per project convention).

**Files to create/modify:**

- `apps/store-client/src/shared/test/msw-handlers.ts` — add `productSlug` and `imageUrl` to
  `makeOrderItem` defaults
- `apps/store-client/src/shared/api/generated/` — regenerated (gitignored, not committed)

---

### TASK-134-B: Extract `OrderItemRow` client component — image + PDP link + dictionary key

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-134-A

**Acceptance Criteria:**

- [ ] New file `apps/store-client/src/widgets/order-confirmation/ui/order-item-row.tsx` created
      with `"use client"` directive.
- [ ] Imports: `Link` from `next/link`; `useState` from `react`; `OrderItemEntity` from
      `@/entities/order`; `formatMoney` from `@/shared/lib`; `ProductThumb` from `@/shared/ui`;
      `dict` from `@/shared/config`.
- [ ] Props: `interface OrderItemRowProps { item: OrderItemEntity }`.
- [ ] Local state: `const [imgFailed, setImgFailed] = useState(false)`.
- [ ] Derived: `const showThumb = !item.imageUrl || imgFailed`.
- [ ] Row structure — `<li>` with `className="flex items-start justify-between gap-3 border-b border-border pb-4 text-sm"`:
  - Left group: `<Link href={\`/products/${item.productSlug}\`} aria-label={dict.order.viewProductAria(item.productName)} className="flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">`
    - When `showThumb === true`: `<ProductThumb name={item.productName} className="size-16 shrink-0 rounded-lg" initialClassName="text-xl" />`
    - When `showThumb === false`: bare `<img src={item.imageUrl!} alt={item.productName} onError={() => setImgFailed(true)} className="size-16 shrink-0 rounded-lg object-cover" />` with ESLint-disable-next-line comment (`@next/next/no-img-element -- Next <Image> deferred to TASK-042 (needs dimensions + CDN remotePatterns)`)
    - Name + price column: `<div className="flex flex-col"><span className="text-foreground">{item.productName}</span><span className="text-muted-foreground">{item.quantity} × {formatMoney(item.price)}</span></div>`
  - Right: `<span className="font-medium text-foreground shrink-0">{formatMoney(item.lineTotal)}</span>` — outside the `<Link>`, as a sibling in the outer `flex` so the line total is not part of the interactive area.
- [ ] `dict.order.viewProductAria: (name: string) => \`Переглянути «${name}»\``added to
   `apps/store-client/src/shared/config/dictionary.ts`in the`order:`block, after
   `notFoundBody`.
- [ ] `ProductThumb` import retained (needed for the fallback case).
- [ ] No TypeScript errors: `npm run typecheck -w apps/store-client`.
- [ ] No ESLint errors: `npm run lint -w apps/store-client` (the `@next/next/no-img-element`
      disable comment must be present on the `<img>` line, same wording as in
      `product-image-gallery.tsx` and `cart-item-row.tsx`).

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-item-row.tsx` — new client component
- `apps/store-client/src/shared/config/dictionary.ts` — add `order.viewProductAria`

---

### TASK-134-C: Refactor `order-item-list.tsx` to use `OrderItemRow`

**Type:** refactor
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-134-B

**Acceptance Criteria:**

- [ ] `order-item-list.tsx` imports `OrderItemRow` from `./order-item-row` (sibling file in the
      same `ui/` directory).
- [ ] The `.map()` body is replaced: `<OrderItemRow key={item.id} item={item} />` — no inline
      rendering of image, name, price, or link. The `<li>` element, image/thumb, link, and
      formatting all live inside `OrderItemRow`.
- [ ] `formatMoney` import removed from `order-item-list.tsx` (now only needed in `order-item-row.tsx`).
- [ ] `order-item-list.tsx` keeps no `"use client"` directive — it remains a server component.
      The stateful rendering is entirely encapsulated in `OrderItemRow`.
- [ ] The `<section>` root of `order-item-list.tsx` (line 16 — `<section className="flex flex-col gap-4">`) is retained; only the `<li>` content changes.
- [ ] No TypeScript errors: `npm run typecheck -w apps/store-client`.
- [ ] Build succeeds: `npm run build -w apps/store-client`.

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-item-list.tsx` — replace `.map()` body
  with `<OrderItemRow>`; remove `formatMoney` import

---

### TASK-134-D: `order-confirmation-view.tsx` — layout fix

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-134-A (TASK-131 must be merged before this task so the cancel-button code
is present in the file when this layout restructuring is applied)

**Acceptance Criteria:**

- [ ] The `<section className="flex flex-col gap-8 lg:col-span-2">` content-column wrapper
      (line 105) is changed to `<div className="flex flex-col gap-8 lg:col-span-2">`. Rationale:
      a `<section>` without its own heading violates HTML semantics (WCAG 1.3.1); the element is
      a layout container only, and `<div>` is correct here. `OrderItemList` and
      `OrderAddressSummary` each carry their own `<section>` + `<h2>` headings internally.
- [ ] The `<div className="flex flex-wrap gap-4">` CTA strip (currently the last child of the
      root `<div className="flex flex-col gap-8">`, after the `lg:grid` block) is moved to be
      the last child of the new content `<div className="... lg:col-span-2">`, directly after
      `<OrderAddressSummary>`.
- [ ] After the move, the root `<div className="flex flex-col gap-8">` has exactly two children:
      `<OrderConfirmationHeader>` and the `<div class="flex flex-col gap-8 lg:grid lg:grid-cols-3">`.
      The CTA strip is no longer a child of the root.
- [ ] The CTA strip retains all content from TASK-131-D unchanged:
  - `<Link href="/" className={primaryCta}>{dict.common.continueShopping}</Link>`
  - `{order.status === 'PENDING' && <CancelOrderButton orderId={order.id} />}` (the cancel button
    added by TASK-131; must be present and positioned correctly in the strip)
- [ ] `CancelOrderButton` import (added by TASK-131-D from `@/features/cancel-order`) is preserved
      exactly as TASK-131 left it — no import changes.
- [ ] Desktop layout result (`lg:` grid active):
  ```
  [OrderItemList        ]  │  OrderTotalsBreakdown
  [OrderAddressSummary  ]  │  notes (if any)
  [CTA: Continue/Cancel ]  │
  ```
- [ ] Mobile layout result (flex-col):
      OrderItemList → OrderAddressSummary → CTA strip → OrderTotalsBreakdown → notes
- [ ] No TypeScript errors: `npm run typecheck -w apps/store-client`.
- [ ] No ESLint errors: `npm run lint -w apps/store-client`.

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx` —
  change `<section>` → `<div>` for content column; move CTA strip inside content `<div>`

---

### TASK-134-E: RTL+MSW tests + final verification gate

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (RTL assertions on render behaviour, per `frontend-testing` skill)
**Depends on:** TASK-134-B, TASK-134-C, TASK-134-D

**Acceptance Criteria:**

**New test file — `order-item-row.test.tsx`:**

- [ ] File `apps/store-client/src/widgets/order-confirmation/ui/order-item-row.test.tsx` created;
      uses `renderWithProviders` from `@/shared/test/render` and `makeOrderItem` from
      `@/shared/test/msw-handlers`.

- [ ] **Test 1 — image renders when `imageUrl` is provided:**

  ```
  makeOrderItem({ imageUrl: "https://example.com/img.jpg", productSlug: "test-slug",
                  productName: "Test Product" })
  → screen.getByRole("img", { name: "Test Product" }) has src "https://example.com/img.jpg"
  → screen.queryByRole("link", ...) is in the document
  ```

- [ ] **Test 2 — link points to the correct PDP URL:**

  ```
  makeOrderItem({ productSlug: "iphone-case", productName: "iPhone Case" })
  → screen.getByRole("link", { name: dict.order.viewProductAria("iPhone Case") })
      has href "/products/iphone-case"
  ```

- [ ] **Test 3 — `ProductThumb` renders when `imageUrl` is null:**

  ```
  makeOrderItem({ imageUrl: null, productName: "No-image Product" })
  → screen.queryByRole("img", { name: "No-image Product" }) is null (no <img> element)
  → the link is still in the document (slug link wraps the thumb)
  ```

- [ ] **Test 4 — `ProductThumb` fallback renders on image load error:**
  ```
  makeOrderItem({ imageUrl: "https://example.com/bad.jpg", productName: "Broken Image" })
  → render; fireEvent.error(screen.getByRole("img", { name: "Broken Image" }))
  → screen.queryByRole("img", { name: "Broken Image" }) is removed from DOM
  ```

**Updated `order-confirmation-view.test.tsx`:**

- [ ] Existing test 1 ("renders UA shipping address fields") passes unchanged — text-content
      assertions are unaffected by the layout restructuring.
- [ ] Existing test 2 ("localizes the country code") passes unchanged.
- [ ] Existing test 3 ("redirects unauthenticated visitors") passes unchanged.
- [ ] New test 4 — **layout: CTA strip co-located with content, cancel button present for PENDING:**
  ```
  makeOrder({ status: 'PENDING', items: [makeOrderItem()] })
  → "Continue shopping" link in the document
  → dict.cancelOrder.trigger button in the document
       (the cancel button from TASK-131 must survive the layout restructuring)
  ```
  Note: `CancelOrderButton` renders a button via the `useCancelOrder` hook; the MSW default
  cancel handler (added by TASK-131-E to `msw-handlers.ts`) must be present for this test.

**Final gate:**

- [ ] `npm run test -w apps/store-client` — all tests green (3 existing + 1 updated view tests +
      4 new `order-item-row` tests).
- [ ] `npm run typecheck -w apps/store-client` — zero TypeScript errors.
- [ ] `npm run lint -w apps/store-client` — zero warnings or errors (including the
      `@next/next/no-img-element` disable comment on the `<img>` line).
- [ ] `npm run build -w apps/store-client` — clean build.

- [ ] **Manual smoke (running stack):**
  - Navigate to `/orders/[id]/confirmation` for an order with image-bearing products.
  - Each line item shows the product's primary image thumbnail (size 16 — 4rem square).
  - Clicking the thumbnail or product name navigates to `/products/{productSlug}`.
  - A product with no images (`imageUrl: null`) shows the gradient `ProductThumb` fallback.
  - Intentionally breaking an image URL (network tab block) shows the `ProductThumb` fallback
    after the `onError` fires.
  - On desktop (`lg:` breakpoint), the "Continue shopping" and "Cancel order" (for PENDING) CTA
    buttons appear below the address section, NOT below the totals sidebar.
  - On mobile, the CTA buttons appear after the delivery address and before the totals breakdown.
  - Existing cancel-order flow (TASK-131): PENDING order shows the cancel button; confirming
    cancel via the dialog changes the status badge to "Скасовано" without page reload.
  - Non-PENDING orders show no cancel button (TASK-131 invariant preserved).

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-item-row.test.tsx` — 4 new tests
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.test.tsx` —
  1 new test (layout + cancel button survival); 3 existing tests confirmed unchanged

---

## Execution Order

```
TASK-158 merges to develop (Wave-0 prereq — not this branch)
TASK-131 merges to develop (Wave-1 prereq — not this branch)
          ↓
TASK-134-A  (Orval regen + makeOrderItem update; branch created, types compile)
          ↓
TASK-134-B  (OrderItemRow component + dict key)
     ↓
TASK-134-C  (order-item-list.tsx refactored)
     ↓
TASK-134-D  (order-confirmation-view.tsx layout fix)
     ↓
TASK-134-E  (RTL+MSW tests + final gate)
```

TASK-134-C and TASK-134-D can be partially overlapped if working in the same branch (distinct
files), but TASK-134-B must complete before TASK-134-C starts.

---

## TASK-133 consistency note

TASK-133 (`docs/plans/080-cart-line-images-links.md`) applies an identical image + PDP-link
pattern to `cart-item-row.tsx`. TASK-134 MUST use the same markup pattern verbatim:

- Bare `<img>` element (not `next/image`) with `onError` state + `ProductThumb` fallback
- The same ESLint-disable comment wording
- `<Link>` wrapping the thumbnail + name column (line-total outside the link)
- `focus-visible:ring-2 focus-visible:ring-ring rounded` focus ring on the link
- `"use client"` on the row component; the list component stays server-side

The only differences from TASK-133's pattern are the component names, the dict key namespace
(`dict.order.viewProductAria` vs `dict.cart.viewProductAria`), and the file locations.

---

## Verification (before opening PR)

- [ ] `npm run test -w apps/store-client` — all tests green.
- [ ] `npm run typecheck -w apps/store-client` — clean.
- [ ] `npm run lint -w apps/store-client` — clean.
- [ ] `npm run build -w apps/store-client` — clean build.
- [ ] Swagger / Orval: `OrderItemEntity` includes `productSlug` (string) and `imageUrl`
      (string | null) in the generated types — visible in
      `apps/store-client/src/shared/api/generated/`.
- [ ] Manual smoke items listed in TASK-134-E above.

---

## Completion Checklist

- [ ] TASK-134-A: Orval regen run; `makeOrderItem` updated with `productSlug` + `imageUrl`
      defaults; all existing tests green
- [ ] TASK-134-B: `order-item-row.tsx` created (`"use client"`, image + link + ESLint-disable
      comment); `dict.order.viewProductAria` added; typecheck + lint clean
- [ ] TASK-134-C: `order-item-list.tsx` refactored to use `<OrderItemRow>`; `formatMoney`
      import removed; server component preserved (no `"use client"`)
- [ ] TASK-134-D: `order-confirmation-view.tsx` content `<section>` → `<div>`; CTA strip moved
      inside content column; TASK-131 cancel-button code preserved intact
- [ ] TASK-134-E: 4 new `order-item-row.test.tsx` tests passing; `order-confirmation-view.test.tsx`
      updated (1 new test; 3 existing unchanged); full gate green
- [ ] `BACKLOG.md` TASK-134 row updated: `⬜` → `✅` at merge; plan link set to this file
