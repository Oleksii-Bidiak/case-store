# Plan 088 — Admin order-detail line-item product links (TASK-156)

**Phase:** Phase 4 (Admin Panel) / Tier 3 UX polish — admin counterpart of the storefront
product-link work (TASK-133 / TASK-134, plans 080 / 081)
**Roadmap context:** Admin Order Management — each line item's product name in the order-detail
table is static text today. This plan makes it an internal link to the product edit page
(`/products/[id]/edit`) so admins can jump directly from an order to the relevant product.
**Branch:** `feat/156-admin-order-line-item-product-links` (branched from `develop`)
**Created:** 2026-06-29
**Status:** ⬜ To Do
**Agent:** `build` (store-admin frontend only; no backend, no Orval regen)

---

## User Story

As an admin reviewing an order, I want to click a product name in the order line-items table and
land on that product's edit page, so that I can quickly inspect or correct product data without
manually searching the product list.

---

## Problem Statement

The admin order-detail page (`/orders/[id]`) renders each `OrderItemEntity` in a `<Table>`. The
product-name cell is currently static text:

```tsx
<TableCell className="font-medium">{item.productName}</TableCell>
```

There is no path from an order line item to the product edit page. An admin must leave the order
detail, navigate to the product list, find the product, and open it manually. This is a friction
point that grows with order volume.

The storefront counterpart (TASK-133 / TASK-134) added PDP links to cart and order-confirmation
line items using `productSlug`. The admin variation requires the product **edit** page and uses
`productId` — which is already carried by `OrderItemEntity` — as the route parameter.

---

## Investigation Findings

### `OrderItemEntity` already carries `productId`

`apps/store-admin/src/shared/api/generated/models/orderItemEntity.ts` (Orval-generated, read-only):

```typescript
export interface OrderItemEntity {
  id: string;
  productId: string; // "Product (position) ID this line refers to"
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
  quantity: number;
  price: string;
  lineTotal: string;
  createdAt: string;
}
```

`productId` is already present and typed as a required `string`. No backend change, no Prisma
migration, and no Orval regen are needed.

### Target route: `/products/[id]/edit`

`apps/store-admin/src/app/(dashboard)/products/[id]/edit/page.tsx` — the route is
`/products/${item.productId}/edit`. The route parameter is `id` (the product's UUID), which
matches `item.productId` exactly.

This works for **deactivated products** too: the edit page is protected by the admin session guard
and loads the product by ID regardless of `isActive` status. Products are soft-deleted (`deletedAt`
— set once, never cleared), so a deleted product's edit page may return 404, but soft-deleted
products remain in the order history without disrupting the link.

### Current `order-detail-view.tsx` — link and styling context

File: `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx`

- Already imports `Link` from `next/link` (line 3) — used for the "← Назад до замовлень" back link.
- Back link style: `text-sm text-muted-foreground hover:text-foreground`.
- Product name cell (lines 165–167):

```tsx
<TableCell className="font-medium">{item.productName}</TableCell>
```

The wrapping `<Link>` should use `font-medium text-primary hover:underline` to stand out as a
clickable element in the table context, consistent with how interactive table entries are styled
across the admin panel.

### `dict.orders` block — placement of new key

`apps/store-admin/src/shared/config/dictionary.ts`, `orders:` block. Existing `item*` keys
(lines 373–376):

```typescript
itemProduct: "Товар",
itemUnitPrice: "Ціна за од.",
itemQty: "К-сть",
itemLineTotal: "Сума",
```

The new `viewProductAria` key belongs after `itemLineTotal`, keeping all item-row keys together.
The aria verb is **"Редагувати"** (not "Переглянути" used by the storefront) because the link
target is the edit page, not a read-only PDP.

### Test file: `order-detail-view.test.tsx`

`apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx`

The local `makeOrder()` factory builds items **without** `productId`:

```typescript
items: [
  {
    id: "item-1",
    productName: "iPhone 15 Pro Case",
    price: "29.99",
    quantity: 1,
    lineTotal: "29.99",
  },
],
```

TypeScript will error when `productId` is required by the updated `OrderItemEntity` shape (it is
already required in the generated type, meaning the existing test file is currently passing only
because the component does not read `productId` yet — once the link is added, the missing field
in the factory will cause a type error). The factory must be updated to include
`productId: "prod-uuid-1"`. The three existing tests must continue to pass.

---

## Migration / schema impact

None. No Prisma schema changes. No NestJS module changes. No Swagger/Orval regen. This is a
purely `store-admin` frontend change: one component file and one dictionary file.

---

## Tasks

### TASK-156-A: Link the product-name cell + add `dict.orders.viewProductAria` key

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — the product-name
      `<TableCell>` wraps `item.productName` in a `<Link>`:

  ```tsx
  <TableCell>
    <Link
      href={`/products/${item.productId}/edit`}
      aria-label={dict.orders.viewProductAria(item.productName)}
      className="font-medium text-primary hover:underline"
    >
      {item.productName}
    </Link>
  </TableCell>
  ```

  The outer `className="font-medium"` on `<TableCell>` is removed (moved into the link).

- [ ] The `Link` import from `next/link` is already present on line 3 — no new import needed.

- [ ] `apps/store-admin/src/shared/config/dictionary.ts` — a new key is added to the `orders:`
      block, directly after `itemLineTotal`:

  ```typescript
  viewProductAria: (name: string) => `Редагувати «${name}»`,
  ```

- [ ] `npm run typecheck -w apps/store-admin` — zero TypeScript errors.
- [ ] `npm run lint -w apps/store-admin` — zero ESLint warnings or errors.

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — wrap product-name
  text in `<Link href={...} aria-label={...}>`; remove `className="font-medium"` from
  `<TableCell>`
- `apps/store-admin/src/shared/config/dictionary.ts` — add `orders.viewProductAria` key after
  `itemLineTotal`

---

### TASK-156-B: Update `makeOrder()` factory + add link test; full verification gate

**Type:** test
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No (RTL assertion on render behaviour, per `frontend-testing` skill)
**Depends on:** TASK-156-A

**Acceptance Criteria:**

**Factory update in `order-detail-view.test.tsx`:**

- [ ] The `items` array in `makeOrder()` is updated to include `productId`:

  ```typescript
  items: [
    {
      id: "item-1",
      productId: "prod-uuid-1",
      productName: "iPhone 15 Pro Case",
      price: "29.99",
      quantity: 1,
      lineTotal: "29.99",
    },
  ],
  ```

**New test — product name link renders:**

- [ ] A fourth test is added to the existing `describe("OrderDetailView — customer section")` block
      (or a new focused `describe` if preferred):

  ```
  it("renders product name as a link to the product edit page")
  ```

  Assertions:
  - After the order loads, a `<link>` (anchor) with the text `"iPhone 15 Pro Case"` is in
    the document.
  - The link's `href` attribute equals `"/products/prod-uuid-1/edit"`.
  - The link's `aria-label` equals `dict.orders.viewProductAria("iPhone 15 Pro Case")` —
    i.e. `"Редагувати «iPhone 15 Pro Case»"`.
  - `screen.queryByText("iPhone 15 Pro Case")` outside an anchor does NOT exist (the name
    is no longer bare text).

**Existing tests (regression guard):**

- [ ] Test 1 — "renders a Customer card with the account email and name" — still passes unchanged.
- [ ] Test 2 — "omits the Customer card when no customer is present" — still passes unchanged.
- [ ] Test 3 — "renders independent status and payment-status controls (TASK-151)" — still passes
      unchanged.

**Final verification gate:**

- [ ] `npm run test -w apps/store-admin` — all tests green (3 existing + 1 new link test);
      total count increases by 1.
- [ ] `npm run typecheck -w apps/store-admin` — zero TypeScript errors.
- [ ] `npm run lint -w apps/store-admin` — zero warnings or errors.
- [ ] `npm run build -w apps/store-admin` — clean build.

- [ ] **Manual smoke (running stack):**
  - Open an admin order detail page. Each product name in the "Товар" column renders as a
    clickable link.
  - Clicking a product name navigates to `/products/{productId}/edit` (the product edit form
    for that specific product opens).
  - Hovering over the link shows an underline (CSS `hover:underline`).
  - For a **deactivated** product: the link still navigates to the edit page (deactivation
    hides the product from the storefront but does not block the admin edit route).
  - The back link ("← Назад до замовлень") is unaffected and still works.
  - No console errors or TypeScript runtime warnings.

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` — add `productId`
  to `makeOrder()` items factory; add the new link-renders test

---

## Execution Order

```
TASK-156-A  (link + dict key — component + dictionary changes)
     ↓
TASK-156-B  (factory update + new test + full verification gate)
```

The two sub-tasks can technically be done in a single sitting, but keeping them separate ensures
the implementation is verified before the test file is touched.

---

## Consistency note — plans 080 / 081 (storefront) vs plan 088 (admin)

| Dimension         | Storefront (TASK-133/134, plans 080/081)                   | Admin (TASK-156, plan 088)                     |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Route target      | `/products/{productSlug}` (PDP)                            | `/products/{productId}/edit` (admin edit page) |
| Route param used  | `item.productSlug`                                         | `item.productId`                               |
| Aria verb         | "Переглянути «…»"                                          | "Редагувати «…»"                               |
| Dict namespace    | `dict.order.viewProductAria` / `dict.cart.viewProductAria` | `dict.orders.viewProductAria`                  |
| Image thumbnail   | Yes — `imageUrl` + `ProductThumb` fallback                 | No — text link only (admin table context)      |
| Component pattern | `"use client"` `OrderItemRow` extraction                   | Inline change in existing `"use client"` view  |
| Backend change    | None (TASK-158 prep already done)                          | None                                           |

---

## Verification (before opening PR)

- [ ] `npm run test -w apps/store-admin` — all tests green.
- [ ] `npm run typecheck -w apps/store-admin` — clean.
- [ ] `npm run lint -w apps/store-admin` — clean.
- [ ] `npm run build -w apps/store-admin` — clean build.
- [ ] Manual smoke items listed in TASK-156-B above.

---

## Completion Checklist

- [ ] TASK-156-A: `order-detail-view.tsx` product-name cell wraps name in `<Link
    href={/products/${item.productId}/edit}>` with `aria-label`; `className="font-medium"`
      moved from `<TableCell>` into link; `dict.orders.viewProductAria` key added after
      `itemLineTotal`; typecheck + lint clean
- [ ] TASK-156-B: `makeOrder()` items factory includes `productId: "prod-uuid-1"`; new link-renders
      test passes; 3 existing tests unchanged; full gate (`test` + `typecheck` + `lint` + `build`)
      green
- [ ] `BACKLOG.md` TASK-156 row updated: `⬜` → `✅` at merge; plan link set to this file
