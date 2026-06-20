# Plan: Ukrainian Localization & UAH Currency (store-client)

> **Status:** In Progress
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-20
> **Last Updated:** 2026-06-20
> **Sequencing:** This plan executes BEFORE plan 039 (Storefront UI/UX Redesign, TASK-068). The redesign tasks (068-A through 068-J) must consume Ukrainian strings from the start — there is zero value reworking English strings only to translate them afterward. Any component rebuilt in 039 should be built with the Ukrainian dictionary and UAH formatter from this plan already in place.

---

## Overview

The `apps/store-client` storefront currently renders all user-facing copy in English and formats prices as USD using `Intl.NumberFormat('en-US', { currency: 'USD' })`. This plan replaces every English string with Ukrainian, sets `<html lang="uk">`, and introduces a single canonical `formatMoney` utility that formats amounts as Ukrainian hryvnia (`1 299 ₴`, space thousands separator, no decimal for whole values, comma decimal otherwise) using `Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' })`.

The order-confirmation email (NestJS `MailService`) also contains English copy and a `$` prefix money formatter. Its Ukrainianization is included in scope as a self-contained sub-task — keeping the full customer journey consistent.

---

## Current-State Findings

### String Inventory (English copy in `apps/store-client/src`)

The audit covers every `.tsx` and `.ts` file with user-visible strings. Counts are conservative (one logical phrase = one string, even if spread across JSX).

| File / Slice                                                  | English Strings | Category                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`                                              | 5               | metadata title/description, nav links "Products"/"Cart", footer copyright                                                                                                                |
| `app/page.tsx`                                                | 3               | metadata, section headings "Shop by Category" / "Latest Products"                                                                                                                        |
| `app/products/page.tsx`                                       | 2               | metadata, page heading "All Products"                                                                                                                                                    |
| `app/products/[slug]/page.tsx`                                | 2               | metadata fallback "Product" / "View product details."                                                                                                                                    |
| `app/cart/page.tsx`                                           | 1               | metadata description                                                                                                                                                                     |
| `app/checkout/page.tsx`                                       | 1               | metadata description                                                                                                                                                                     |
| `app/orders/[id]/confirmation/page.tsx`                       | 1               | metadata                                                                                                                                                                                 |
| `app/(auth)/login/page.tsx`                                   | 3               | metadata, page heading "Sign in"                                                                                                                                                         |
| `app/(auth)/register/page.tsx`                                | 3               | metadata, page heading "Create your account"                                                                                                                                             |
| `widgets/hero-banner/ui/hero-banner.tsx`                      | 3               | heading, subtitle, CTA button "Shop Now"                                                                                                                                                 |
| `widgets/category-nav/ui/category-nav.tsx`                    | 1               | error message "Failed to load categories."                                                                                                                                               |
| `widgets/product-list/ui/product-list.tsx`                    | 3               | error, empty-state "No products match your filters." / "Clear filters", count "{n} products found"                                                                                       |
| `widgets/product-list/ui/product-list-view.tsx`               | 0               | (no user-facing strings)                                                                                                                                                                 |
| `features/product-filters/ui/product-filters.tsx`             | 8               | legend "Filters", labels "Category"/"Price range"/"Sort by", option "All categories", sort labels "Newest"/"Price: Low to High"/"Price: High to Low"/"Name: A–Z", button "Clear filters" |
| `features/product-filters/ui/search-input.tsx`                | 1               | placeholder (need to check — likely "Search")                                                                                                                                            |
| `shared/ui/product-card.tsx`                                  | 1               | badge "Sale"                                                                                                                                                                             |
| `widgets/product-detail/ui/product-detail-view.tsx`           | 8               | breadcrumb "Home"/"Products", error "Sorry, we couldn't load…"/"Go back to products", label "SKU:", heading "Description", badge "Sale"                                                  |
| `widgets/product-detail/ui/product-variant-selector.tsx`      | 2               | legend "Choose a variant", stock states "Out of stock"/"In stock (N)"                                                                                                                    |
| `features/add-to-cart/ui/add-to-cart-button.tsx`              | 3               | "Add to Cart", "Adding…", "Added ✓", error "Could not add this item."                                                                                                                    |
| `widgets/cart/ui/cart-view.tsx`                               | 7               | error/retry, empty-state heading/subtitle/link, heading "Shopping Cart", aria-live text                                                                                                  |
| `widgets/cart/ui/cart-item-row.tsx`                           | 6               | aria-labels "Remove item"/"Decrease quantity"/"Increase quantity"/"Quantity", button "Remove", error "Could not update…"                                                                 |
| `widgets/cart/ui/cart-summary.tsx`                            | 7               | heading "Order Summary", "Subtotal", "Total", "Proceed to Checkout", confirm dialog "Remove all items…?", "Clearing…"/"Clear cart", error                                                |
| `widgets/checkout/ui/checkout-order-summary.tsx`              | 4               | heading "Order Summary", "Subtotal", error, disclaimer "Prices shown reflect…"                                                                                                           |
| `widgets/checkout/ui/checkout-view.tsx`                       | 5               | heading "Checkout", checkbox label "Billing address same as shipping", label "Order notes (optional)", counter "N/500", button "Placing order…"/"Place order", error                     |
| `features/checkout/ui/checkout-address-form.tsx`              | 12              | all field labels (First name, Last name, Company, Address line 1, Address line 2, City, State/region, Postal code, Country, Phone) + "(optional)" marker + legend prop from caller       |
| `features/checkout/model/checkout-schema.ts`                  | 10              | all zod validation messages (required, length, format)                                                                                                                                   |
| `features/checkout/model/use-checkout.ts`                     | 2               | error messages (400 / generic)                                                                                                                                                           |
| `widgets/order-confirmation/ui/order-confirmation-header.tsx` | 5               | heading "Thank you for your order!", "Order number:", "Placed on:", "Order status", "Payment: {status}"                                                                                  |
| `widgets/order-confirmation/ui/order-item-list.tsx`           | 1               | heading "Items Ordered"                                                                                                                                                                  |
| `widgets/order-confirmation/ui/order-address-summary.tsx`     | 2               | titles "Shipping Address"/"Billing Address"                                                                                                                                              |
| `widgets/order-confirmation/ui/order-totals-breakdown.tsx`    | 6               | heading "Order Summary", rows "Subtotal"/"Discount"/"Shipping"/"Tax"/"Total"                                                                                                             |
| `widgets/order-confirmation/ui/order-confirmation-view.tsx`   | 7               | error states, "Something went wrong"/"We couldn't find that order", CTAs "Try again"/"Go to home page"/"Continue shopping", "Order Notes"                                                |
| `features/auth/ui/login-form.tsx`                             | 7               | labels "Email"/"Password", button "Sign in"/"Signing in…", link "Register", error messages, link text "Don't have an account?"                                                           |
| `features/auth/ui/register-form.tsx`                          | 9               | labels "Email"/"First name"/"Last name"/"Password"/"Confirm password", button "Create account"/"Creating…", link "Sign in", errors                                                       |
| `features/auth/ui/logout-button.tsx`                          | 2               | "Sign out"/"Signing out…"                                                                                                                                                                |
| `widgets/header/ui/header-auth.tsx`                           | 3               | "Sign in", "Register", "My account"                                                                                                                                                      |
| `shared/lib/schema/buildProductSchema.ts`                     | 0               | (structured data only; no user-facing strings)                                                                                                                                           |

**Total: ~130–140 distinct English strings across ~30 files.**

### Currency Formatting Inventory

**Pattern today:** Each file that displays money instantiates its own local `priceFormatter`:

```ts
const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
function formatPrice(value: string): string { … }
```

This pattern is duplicated identically in **6 files**:

| File                                                       | Currency calls                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `shared/ui/product-card.tsx`                               | `formatPrice(product.price)`, `formatPrice(product.compareAtPrice)`                           |
| `widgets/cart/ui/cart-item-row.tsx`                        | `formatPrice(item.price)`, `formatPrice(item.compareAtPrice)`, `formatPrice(item.lineTotal)`  |
| `widgets/cart/ui/cart-summary.tsx`                         | `formatPrice(totals.subtotal)` × 2                                                            |
| `widgets/checkout/ui/checkout-order-summary.tsx`           | `formatPrice(item.price)`, `formatPrice(item.lineTotal)`, `formatPrice(cart.totals.subtotal)` |
| `widgets/order-confirmation/ui/order-item-list.tsx`        | `formatPrice(item.price)`, `formatPrice(item.lineTotal)`                                      |
| `widgets/order-confirmation/ui/order-totals-breakdown.tsx` | `formatPrice(subtotal/discount/shippingCost/tax/total)`                                       |
| `widgets/product-detail/ui/product-detail-view.tsx`        | `formatPrice(displayPrice)`, `formatPrice(product.compareAtPrice)`                            |
| `widgets/product-detail/ui/product-variant-selector.tsx`   | `formatPrice(variant.price)`                                                                  |

Additionally, `order-confirmation-header.tsx` has an **`Intl.DateTimeFormat("en-US", …)`** for order date rendering — locale must change to `"uk-UA"`.

The **email template** (`apps/store-api/src/mail/templates/order-confirmation.template.ts`) has its own `formatMoney` that just prefixes `$`:

```ts
function formatMoney(value: string): string {
  return `$${value}`;
}
```

All subject/body copy is English.

### Amount Storage

Prices are stored in PostgreSQL as `Decimal(10, 2)` (i.e. **major currency units** — `29.99` means 29 hryvnias 99 kopecks). The API serializes these to decimal strings (`"29.99"`, `"1299.00"`). There are **no cents/minor-unit integer amounts** — amounts are ready to pass directly to `Intl.NumberFormat`. The `lineTotal` calculation in `CartItemEntity.fromPrisma` does convert to integer cents internally for precision, then formats back to a decimal string — this is an implementation detail that does not affect the formatter API.

### Locale & SEO

- `app/layout.tsx`: `<html lang="en">` — must change to `lang="uk"`.
- `metadata.description` in multiple pages — all English, must be Ukrainian.
- `openGraph.locale` is not set — should add `locale: 'uk_UA'`.
- `order-confirmation-header.tsx`: `Intl.DateTimeFormat("en-US", …)` — must change to `"uk-UA"`.
- `shared/config/site.ts`: `CURRENCY` defaults to `"USD"` — must default to `"UAH"` once `NEXT_PUBLIC_CURRENCY=UAH` is set in `.env`.
- `buildProductSchema` already passes `currency` from `CURRENCY` constant — no structural change needed; only the env var value changes.

### Existing i18n Setup

None. No `next-intl`, no `i18n` config in `next.config.ts`, no message catalog. The app is fully single-locale with English strings hardcoded in JSX/schema.

---

## Decisions

### Decision 1: i18n Approach — Lightweight Typed Dictionary (Recommended)

**Recommendation: Option (b) — a single Ukrainian rewrite with a typed dictionary in `shared/config/dictionary.ts`, no new dependency.**

**Rationale:** The storefront is and will remain a single-locale Ukrainian store — there is no requirement for English or any other language, now or in the foreseeable roadmap. Introducing `next-intl` would add a new dependency, require wrapping every Server Component and Client Component with a provider and `useTranslations` hook, restructure message keys, and introduce a build-time message compilation step — all for a benefit (multi-locale switching) that is not needed.

The lightweight approach:

- Zero new npm dependencies.
- A single `shared/config/dictionary.ts` file that exports a typed `uk` object — an object tree grouped by page/widget slice.
- Every component imports the relevant slice of the dictionary directly (`import { dict } from "@/shared/config"`).
- TypeScript provides full autocomplete and compile-time safety on every key.
- If multi-locale is ever required, migrating to `next-intl` at that point is straightforward: the dictionary key structure already matches `next-intl`'s message catalog shape.

**Not chosen:** `next-intl` — over-engineered for a confirmed single-locale deployment.

### Decision 2: Currency Strategy — Single Formatter Utility

**Recommendation: Create `shared/lib/format/formatMoney.ts` with a single `formatMoney(value: string): string` utility.** Set `NEXT_PUBLIC_CURRENCY=UAH` in `.env` and `.env.example`. Replace all 6 local `priceFormatter` + `formatPrice` duplicates with the shared import.

```ts
// shared/lib/format/formatMoney.ts
const formatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatter.format(amount) : value;
}
```

`Intl.NumberFormat('uk-UA', { currency: 'UAH' })` produces: `1 299 ₴` (non-breaking space as thousands separator, `₴` symbol, Ukrainian convention). Setting `minimumFractionDigits: 0` means whole amounts display as `1 299 ₴` not `1 299,00 ₴`, while `"29.99"` formats as `29,99 ₴`. This matches Ukrainian e-commerce conventions.

The `CURRENCY` constant in `shared/config/site.ts` is used only for Schema.org `priceCurrency` (not for display) — it reads `process.env.NEXT_PUBLIC_CURRENCY ?? "USD"`. Setting the env var to `UAH` is sufficient to align it; no code change is required in that file.

### Decision 3: Price Data — No Rethinking Required

Prices in the database and seed data are stored as `Decimal(10, 2)` values. They were entered as numbers that are meaningful as Ukrainian hryvnia amounts (e.g., `299.99` = 299 hryvnias 99 kopecks). The fact that the old formatter labelled them as USD was a display-only error. No data migration is needed.

### Decision 4: Order-Confirmation Email — In Scope

The email is part of the customer-facing purchase flow. Sending an English email after a Ukrainian checkout experience is jarring. The email template is a pure function and is easy to translate. This task is included as a sub-task at the end of the sequence.

---

## Technical Design

### New Files

```
apps/store-client/src/shared/lib/format/formatMoney.ts       — canonical UAH formatter
apps/store-client/src/shared/lib/format/formatMoney.test.ts  — unit tests (TDD)
apps/store-client/src/shared/config/dictionary.ts            — typed Ukrainian string dictionary
```

### Modified Files (summary)

- `shared/config/index.ts` — re-export `dictionary`
- `shared/lib/index.ts` — re-export `formatMoney`
- `app/layout.tsx` — `lang="uk"`, Ukrainian metadata, OG `locale: 'uk_UA'`
- All 8 currency-displaying files — remove local `priceFormatter`, import `formatMoney`
- `order-confirmation-header.tsx` — locale to `"uk-UA"` in `Intl.DateTimeFormat`
- All widget/feature/page files with English copy — import and use `dict`
- `features/checkout/model/checkout-schema.ts` — Ukrainian zod messages
- `apps/store-api/src/mail/templates/order-confirmation.template.ts` — Ukrainian copy + `₴` formatter

---

## Tasks

### TASK-069: Central Money Formatter (UAH) + Env Variable

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** Yes
**Depends on:** none

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/lib/format/formatMoney.ts` exists and exports `formatMoney(value: string): string`
- [ ] Formatter uses `Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0, maximumFractionDigits: 2 })`
- [ ] `formatMoney("1299")` returns a string containing `₴` and `1 299` (space-separated thousands)
- [ ] `formatMoney("29.99")` returns a string containing `29,99 ₴` (comma decimal, Ukrainian convention)
- [ ] `formatMoney("0")` returns `0 ₴`
- [ ] `formatMoney("not-a-number")` returns `"not-a-number"` (passthrough for invalid input)
- [ ] Unit tests in `formatMoney.test.ts` cover all cases above (TDD: Red first)
- [ ] `shared/lib/format/index.ts` re-exports `formatMoney`
- [ ] `shared/lib/index.ts` re-exports from `./format`
- [ ] `NEXT_PUBLIC_CURRENCY=UAH` added to `apps/store-client/.env` (note: `.env` files are gitignored and blocked by pre-commit hook — developer must update manually; document in `.env.example` comment)
- [ ] `npm run test -w apps/store-client` passes (if test runner is configured) or `npx jest formatMoney` passes
- [ ] `npm run build -w apps/store-client` passes (typecheck included)

**Files to create/modify:**

- `apps/store-client/src/shared/lib/format/formatMoney.ts` — canonical UAH formatter
- `apps/store-client/src/shared/lib/format/formatMoney.test.ts` — TDD unit tests
- `apps/store-client/src/shared/lib/format/index.ts` — barrel
- `apps/store-client/src/shared/lib/index.ts` — add format re-export

---

### TASK-069-A: Replace Scattered Currency Formatters with `formatMoney`

**Type:** refactor
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069

**Acceptance Criteria:**

- [ ] `shared/ui/product-card.tsx` — remove local `priceFormatter` + `formatPrice`; import `formatMoney` from `@/shared/lib`; all `formatPrice(...)` calls replaced
- [ ] `widgets/cart/ui/cart-item-row.tsx` — same removal + replacement
- [ ] `widgets/cart/ui/cart-summary.tsx` — same
- [ ] `widgets/checkout/ui/checkout-order-summary.tsx` — same
- [ ] `widgets/order-confirmation/ui/order-item-list.tsx` — same
- [ ] `widgets/order-confirmation/ui/order-totals-breakdown.tsx` — same
- [ ] `widgets/product-detail/ui/product-detail-view.tsx` — same
- [ ] `widgets/product-detail/ui/product-variant-selector.tsx` — same
- [ ] Zero occurrences of `Intl.NumberFormat("en-US"` or `currency: "USD"` remain in `apps/store-client/src/**/*.tsx` or `*.ts`
- [ ] `npm run build -w apps/store-client` + typecheck pass
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx`
- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-item-list.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-totals-breakdown.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-variant-selector.tsx`

---

### TASK-069-B: Ukrainian String Dictionary

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4h)
**TDD Required:** No
**Depends on:** none (parallel with TASK-069)

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/config/dictionary.ts` exists and exports a `const dict` object typed as `Readonly<typeof dict>`
- [ ] Dictionary is organized by slice: `dict.nav`, `dict.hero`, `dict.catalog`, `dict.product`, `dict.cart`, `dict.checkout`, `dict.order`, `dict.auth`, `dict.common`, `dict.meta`
- [ ] Every English string found in the string inventory (see Current-State Findings) has a Ukrainian equivalent entry
- [ ] All Ukrainian text is grammatically correct Ukrainian (not machine-translated without review)
- [ ] Key naming follows camelCase and is descriptive (e.g. `dict.cart.emptyHeading`, not `dict.cart.str1`)
- [ ] `shared/config/index.ts` re-exports `dict`
- [ ] TypeScript compiles without error (`npm run typecheck -w apps/store-client`)

Key Ukrainian translations to include (representative, not exhaustive):

| English                            | Ukrainian                                        |
| ---------------------------------- | ------------------------------------------------ |
| "Shop Now"                         | "Перейти до каталогу"                            |
| "Shop by Category"                 | "Категорії товарів"                              |
| "Latest Products"                  | "Нові надходження"                               |
| "All Products"                     | "Всі товари"                                     |
| "Filters"                          | "Фільтри"                                        |
| "All categories"                   | "Всі категорії"                                  |
| "Price range"                      | "Ціновий діапазон"                               |
| "Sort by"                          | "Сортування"                                     |
| "Newest"                           | "Спочатку нові"                                  |
| "Price: Low to High"               | "Ціна: від низької до високої"                   |
| "Price: High to Low"               | "Ціна: від високої до низької"                   |
| "Name: A–Z"                        | "Назва: А–Я"                                     |
| "Clear filters"                    | "Скинути фільтри"                                |
| "No products match your filters."  | "Товари не знайдено. Спробуйте змінити фільтри." |
| "Sale"                             | "Розпродаж"                                      |
| "Out of stock"                     | "Немає в наявності"                              |
| "In stock (N)"                     | "В наявності (N)"                                |
| "Choose a variant"                 | "Оберіть варіант"                                |
| "Add to Cart"                      | "Додати до кошика"                               |
| "Adding…"                          | "Додаємо…"                                       |
| "Added ✓"                          | "Додано ✓"                                       |
| "Shopping Cart"                    | "Кошик"                                          |
| "Your cart is empty"               | "Ваш кошик порожній"                             |
| "Proceed to Checkout"              | "Оформити замовлення"                            |
| "Clear cart"                       | "Очистити кошик"                                 |
| "Remove"                           | "Видалити"                                       |
| "Remove all items from your cart?" | "Видалити всі товари з кошика?"                  |
| "Order Summary"                    | "Підсумок замовлення"                            |
| "Subtotal"                         | "Сума"                                           |
| "Total"                            | "Разом"                                          |
| "Discount"                         | "Знижка"                                         |
| "Shipping"                         | "Доставка"                                       |
| "Tax"                              | "Податок"                                        |
| "Checkout"                         | "Оформлення замовлення"                          |
| "Shipping address"                 | "Адреса доставки"                                |
| "Billing address"                  | "Адреса оплати"                                  |
| "Billing address same as shipping" | "Адреса оплати збігається з адресою доставки"    |
| "Order notes (optional)"           | "Примітки до замовлення (необов'язково)"         |
| "Place order"                      | "Підтвердити замовлення"                         |
| "Thank you for your order!"        | "Дякуємо за ваше замовлення!"                    |
| "Items Ordered"                    | "Замовлені товари"                               |
| "Shipping Address"                 | "Адреса доставки"                                |
| "Billing Address"                  | "Адреса оплати"                                  |
| "Order Notes"                      | "Примітки"                                       |
| "Continue shopping"                | "Продовжити покупки"                             |
| "Sign in"                          | "Увійти"                                         |
| "Register"                         | "Реєстрація"                                     |
| "My account"                       | "Мій акаунт"                                     |
| "Sign out"                         | "Вийти"                                          |
| "Create your account"              | "Створити акаунт"                                |
| "Email"                            | "Email"                                          |
| "Password"                         | "Пароль"                                         |
| "First name"                       | "Ім'я"                                           |
| "Last name"                        | "Прізвище"                                       |
| "Products"                         | "Товари"                                         |
| "Cart"                             | "Кошик"                                          |
| "Home"                             | "Головна"                                        |
| "Description"                      | "Опис"                                           |
| "SKU:"                             | "Артикул:"                                       |

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — full Ukrainian dictionary
- `apps/store-client/src/shared/config/index.ts` — add `dict` re-export

---

### TASK-069-C: Translate Header, Nav, Footer, and Root Layout

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B

**Acceptance Criteria:**

- [ ] `app/layout.tsx`: `<html lang="uk">`, `openGraph.locale: 'uk_UA'`, metadata `title.default` and `description` in Ukrainian, nav links "Товари" / "Кошик", footer text Ukrainian
- [ ] `app/layout.tsx`: `openGraph` object includes `locale: 'uk_UA'`
- [ ] `widgets/header/ui/header-auth.tsx`: "Sign in" → "Увійти", "Register" → "Реєстрація", "My account" → "Мій акаунт", all from `dict`
- [ ] `features/auth/ui/logout-button.tsx`: "Sign out" → "Вийти", "Signing out…" → "Виходимо…"
- [ ] All strings use `dict.*` — no inline English strings remain in these files
- [ ] Build + typecheck + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx`
- `apps/store-client/src/widgets/header/ui/header-auth.tsx`
- `apps/store-client/src/features/auth/ui/logout-button.tsx`

---

### TASK-069-D: Translate Homepage

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B

**Acceptance Criteria:**

- [ ] `app/page.tsx`: metadata `title`/`description` Ukrainian; section headings use `dict.meta.homeTitle`, `dict.catalog.categories`, `dict.catalog.latestProducts`
- [ ] `widgets/hero-banner/ui/hero-banner.tsx`: heading, subtitle, and CTA all use `dict.hero.*`
- [ ] `widgets/category-nav/ui/category-nav.tsx`: error message Ukrainian
- [ ] No inline English strings remain in these files

**Files to create/modify:**

- `apps/store-client/src/app/page.tsx`
- `apps/store-client/src/widgets/hero-banner/ui/hero-banner.tsx`
- `apps/store-client/src/widgets/category-nav/ui/category-nav.tsx`

---

### TASK-069-E: Translate Product Catalog and Filters

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B, TASK-069-A

**Acceptance Criteria:**

- [ ] `app/products/page.tsx`: metadata + heading "Всі товари" use `dict`
- [ ] `features/product-filters/ui/product-filters.tsx`: legend "Фільтри", all labels, `SORT_OPTIONS` labels, button "Скинути фільтри" — all from `dict`
- [ ] `features/product-filters/ui/search-input.tsx`: placeholder uses `dict`
- [ ] `widgets/product-list/ui/product-list.tsx`: error, empty state, count string, "Clear filters" link — all from `dict`
- [ ] `shared/ui/product-card.tsx`: "Sale" badge uses `dict.product.saleBadge`
- [ ] Build + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/products/page.tsx`
- `apps/store-client/src/features/product-filters/ui/product-filters.tsx`
- `apps/store-client/src/features/product-filters/ui/search-input.tsx`
- `apps/store-client/src/widgets/product-list/ui/product-list.tsx`
- `apps/store-client/src/shared/ui/product-card.tsx`

---

### TASK-069-F: Translate Product Detail Page (PDP)

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B, TASK-069-A

**Acceptance Criteria:**

- [ ] `app/products/[slug]/page.tsx`: metadata fallback "Товар" / "Переглянути деталі товару." use `dict`
- [ ] `widgets/product-detail/ui/product-detail-view.tsx`: breadcrumb labels "Головна"/"Товари", error text, "SKU:", "Опис", "Sale" badge — all use `dict`
- [ ] `widgets/product-detail/ui/product-variant-selector.tsx`: legend "Оберіть варіант", stock strings — all use `dict`
- [ ] `features/add-to-cart/ui/add-to-cart-button.tsx`: "Додати до кошика", "Додаємо…", "Додано ✓", error — all use `dict`
- [ ] All `formatPrice` calls already replaced (TASK-069-A dependency)
- [ ] Build + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/products/[slug]/page.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-variant-selector.tsx`
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.tsx`

---

### TASK-069-G: Translate Cart Page

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B, TASK-069-A

**Acceptance Criteria:**

- [ ] `app/cart/page.tsx`: metadata description Ukrainian
- [ ] `widgets/cart/ui/cart-view.tsx`: all error/retry/empty-state/heading strings use `dict`; aria-live text Ukrainian; `window.confirm` string replaced with `dict.cart.clearConfirm` (or moved to CartSummary — already there, covered below)
- [ ] `widgets/cart/ui/cart-item-row.tsx`: all aria-labels, "Remove" button, error message use `dict`; pluralization for item count handled (Ukrainian has three plural forms — use a helper or simple string interpolation for MVP: `{n} товар / товари / товарів`)
- [ ] `widgets/cart/ui/cart-summary.tsx`: "Order Summary", "Subtotal", "Total", "Proceed to Checkout", `window.confirm` string, "Clear cart", "Clearing…", error — all use `dict`; `formatMoney` used (TASK-069-A)
- [ ] No inline English remains in these files
- [ ] Build + lint pass

**Notes:** Ukrainian has three plural forms for nouns (1 товар, 2–4 товари, 5+ товарів). For MVP a helper `pluralUk(n, one, few, many)` can be added to `shared/lib/format/` or strings can use neutral phrasing to avoid pluralization. Document the decision in the task. The plan recommends neutral phrasing for MVP (e.g., "Кількість позицій: N") to avoid introducing an i18n plural library.

**Files to create/modify:**

- `apps/store-client/src/app/cart/page.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-view.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx`

---

### TASK-069-H: Translate Checkout Page + Zod Validation Messages

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4h)
**TDD Required:** Yes (TDD for schema messages)
**Depends on:** TASK-069-B, TASK-069-A

**Acceptance Criteria:**

- [ ] `app/checkout/page.tsx`: metadata description Ukrainian
- [ ] `features/checkout/model/checkout-schema.ts`: all zod validation messages Ukrainian
  - "Ім'я є обов'язковим"
  - "Прізвище є обов'язковим"
  - "Адреса (рядок 1) є обов'язковою"
  - "Місто є обов'язковим"
  - "Поштовий індекс є обов'язковим"
  - "Введіть 2-літерний код країни (напр. UA)"
  - "Примітки не можуть перевищувати 500 символів"
  - "Адреса оплати є обов'язковою, якщо вона відрізняється від адреси доставки"
- [ ] `features/checkout/model/checkout-schema.test.ts`: existing tests updated to expect Ukrainian messages; TDD: update failing expectations first, then update schema
- [ ] `features/checkout/ui/checkout-address-form.tsx`: all `ADDRESS_FIELDS` labels Ukrainian, "(optional)" → "(необов'язково)"
- [ ] `features/checkout/model/use-checkout.ts`: error messages Ukrainian
- [ ] `widgets/checkout/ui/checkout-view.tsx`: all headings/labels/buttons Ukrainian, "Order notes" → "Примітки до замовлення", checkbox label Ukrainian
- [ ] `widgets/checkout/ui/checkout-order-summary.tsx`: all strings Ukrainian, `formatMoney` used
- [ ] Build + typecheck + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/checkout/page.tsx`
- `apps/store-client/src/features/checkout/model/checkout-schema.ts`
- `apps/store-client/src/features/checkout/model/checkout-schema.test.ts`
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx`
- `apps/store-client/src/features/checkout/model/use-checkout.ts`
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx`
- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx`

---

### TASK-069-I: Translate Order Confirmation Page + Locale Dates

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B, TASK-069-A

**Acceptance Criteria:**

- [ ] `app/orders/[id]/confirmation/page.tsx`: metadata description Ukrainian
- [ ] `widgets/order-confirmation/ui/order-confirmation-header.tsx`:
  - `Intl.DateTimeFormat("en-US", …)` changed to `Intl.DateTimeFormat("uk-UA", …)`
  - Date format verified: Ukrainian convention shows `20 червня 2026 р.`
  - All heading/label strings ("Thank you for your order!", "Order number:", "Placed on:", "Payment:") use `dict.order.*`
  - Order/payment status values remain as-is (backend enum strings: PENDING, CONFIRMED, etc.) — they are technical values, not translated in MVP. A status label map can be added in a future iteration.
- [ ] `widgets/order-confirmation/ui/order-item-list.tsx`: heading "Items Ordered" → uses `dict`; `formatMoney` used (TASK-069-A)
- [ ] `widgets/order-confirmation/ui/order-address-summary.tsx`: titles "Shipping Address"/"Billing Address" use `dict`
- [ ] `widgets/order-confirmation/ui/order-totals-breakdown.tsx`: all labels use `dict`; `formatMoney` used (TASK-069-A)
- [ ] `widgets/order-confirmation/ui/order-confirmation-view.tsx`: all error/CTA strings use `dict`
- [ ] Build + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/orders/[id]/confirmation/page.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-header.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-item-list.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-address-summary.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-totals-breakdown.tsx`
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx`

---

### TASK-069-J: Translate Auth Forms + Zod Validation Messages

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B

**Acceptance Criteria:**

- [ ] `app/(auth)/login/page.tsx`: metadata title/description Ukrainian; heading "Увійти"
- [ ] `app/(auth)/register/page.tsx`: metadata title/description Ukrainian; heading "Створити акаунт"
- [ ] `features/auth/ui/login-form.tsx`:
  - zod messages Ukrainian: "Введіть дійсну email-адресу", "Пароль є обов'язковим"
  - field labels Ukrainian
  - button "Увійти" / "Входимо…"
  - link "Немає акаунту? Реєстрація"
  - error messages Ukrainian: "Невірний email або пароль.", "Щось пішло не так. Спробуйте ще раз."
- [ ] `features/auth/ui/register-form.tsx`:
  - zod messages Ukrainian
  - field labels Ukrainian
  - button "Створити акаунт" / "Створюємо…"
  - link "Вже є акаунт? Увійти"
  - error messages Ukrainian: "Цей email вже зареєстровано.", "Щось пішло не так. Спробуйте ще раз."
- [ ] Build + lint pass

**Files to create/modify:**

- `apps/store-client/src/app/(auth)/login/page.tsx`
- `apps/store-client/src/app/(auth)/register/page.tsx`
- `apps/store-client/src/features/auth/ui/login-form.tsx`
- `apps/store-client/src/features/auth/ui/register-form.tsx`

---

### TASK-069-K: SEO Metadata + `<html lang="uk">` + OpenGraph Locale

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-069-B, TASK-069-C (layout already done), TASK-069-D through J (all page metadata already set)

**Acceptance Criteria:**

- [ ] `app/layout.tsx` `<html lang="uk">` — verified by reading rendered HTML source
- [ ] `app/layout.tsx` `metadata.openGraph.locale` set to `'uk_UA'`
- [ ] `app/layout.tsx` `metadata.description` is Ukrainian (should already be set in TASK-069-C)
- [ ] `app/robots.ts` unchanged — no English user-facing strings
- [ ] `app/sitemap.ts` unchanged — no user-facing strings (URLs only)
- [ ] `shared/config/site.ts` `CURRENCY` defaults to `'UAH'` — update the fallback from `"USD"` to `"UAH"` **and** document in comments that `NEXT_PUBLIC_CURRENCY` must be set to `UAH` in production
- [ ] `shared/lib/schema/buildProductSchema.ts` unchanged (already passes `currency` from `CURRENCY` constant)
- [ ] Manual verification: `curl http://localhost:3000 | grep 'lang="uk"'` returns a match
- [ ] Manual verification: view-source on homepage shows `"@type":"Organization"` JSON-LD with `priceCurrency: "UAH"` on a product page

**Files to create/modify:**

- `apps/store-client/src/shared/config/site.ts` — change `"USD"` fallback to `"UAH"` in `CURRENCY`
- `apps/store-client/src/app/layout.tsx` — `openGraph.locale` (if not done in TASK-069-C)

---

### TASK-069-L: Ukrainianize Order Confirmation Email (store-api)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1–2h)
**TDD Required:** Yes
**Depends on:** none (independent of frontend tasks)

**Acceptance Criteria:**

- [ ] `apps/store-api/src/mail/templates/order-confirmation.template.ts`: `formatMoney` changed from `$${value}` to `${value} ₴`
- [ ] `buildOrderConfirmationEmail` subject: `Замовлення #${orderNumber(id)} підтверджено`
- [ ] HTML template heading: "Дякуємо за ваше замовлення{name}!"
- [ ] HTML template order-received line: "Ваше замовлення #XXXX отримано та обробляється."
- [ ] Table headers: "Товар", "Кіл.", "Разом"
- [ ] Totals rows: "Сума", "Знижка", "Доставка", "Податок", "Разом"
- [ ] Shipping-address heading: "Адреса доставки"
- [ ] Footer disclaimer: Ukrainian equivalent of "If you have any questions about your order, just reply to this email."
- [ ] Plain-text version mirrors all Ukrainian changes
- [ ] `html lang` attribute in HTML template changed to `lang="uk"`
- [ ] `apps/store-api/src/mail/templates/order-confirmation.template.spec.ts`: all existing string assertions updated to expect Ukrainian — TDD: update failing expectations first, then update template
- [ ] `npm run test -w apps/store-api` passes (all tests green, including updated template spec)
- [ ] `npm run build -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/mail/templates/order-confirmation.template.ts`
- `apps/store-api/src/mail/templates/order-confirmation.template.spec.ts`

---

### TASK-069-M: Verification Gate — Build, Typecheck, Lint, Manual Visual Pass

**Type:** chore
**Scope:** store-client, store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** All TASK-069 sub-tasks

**Acceptance Criteria:**

- [ ] `npm run build` (root) — all workspaces build without error
- [ ] `npm run typecheck` (root) — zero TypeScript errors
- [ ] `npm run lint` (root) — zero ESLint errors or warnings
- [ ] `npm run test -w apps/store-api` — all unit tests pass (including email template spec)
- [ ] `npm run test -w apps/store-client` — all unit tests pass (formatMoney + checkout schema)
- [ ] Zero occurrences of `Intl.NumberFormat("en-US"` remain in `apps/store-client/src` (grep check)
- [ ] Zero occurrences of `currency: "USD"` remain in `apps/store-client/src` (grep check)
- [ ] `<html lang="en"` does not appear in `apps/store-client/src/app/layout.tsx`
- [ ] Manual visual pass (requires running stack):
  - [ ] Homepage: Ukrainian heading, "Перейти до каталогу" CTA, "Категорії товарів", "Нові надходження"
  - [ ] Product list page: filter panel is Ukrainian, product count is Ukrainian
  - [ ] Product card: price shown as `1 299 ₴` format
  - [ ] PDP: "Оберіть варіант", "Додати до кошика", price as `₴`
  - [ ] Cart page: "Кошик", "Підсумок замовлення", "Оформити замовлення"
  - [ ] Checkout: Ukrainian address field labels, Ukrainian validation errors on submit
  - [ ] Order confirmation: "Дякуємо за ваше замовлення!", date in Ukrainian format, `₴` prices
  - [ ] Login/Register: Ukrainian form labels, buttons, links
  - [ ] Header: "Товари", "Кошик", "Увійти", "Реєстрація"
  - [ ] No English UI strings visible to the customer anywhere in the storefront

---

## Sequencing Note vs Plan 039 (UI/UX Redesign)

**This plan (040) MUST complete before plan 039 (TASK-068) begins.**

The UI/UX redesign in plan 039 touches every visual component in the storefront. Each redesigned component will be built with the final copy. If 039 starts first:

1. English strings get embedded in new shadcn/ui components.
2. Every redesigned file would need a second translation pass.
3. The hero heading, filter labels, cart copy, and checkout form labels in 039 all depend on the correct Ukrainian strings — the designer/implementer needs to see the actual Ukrainian text to make layout decisions (Ukrainian strings are often longer than English).

**Overlap alert:** Plan 039 task TASK-068-D renames "Latest Products" to "Featured" — once localization is done, the Ukrainian equivalent should be "Рекомендовані товари" (not "Нові надходження"). The build agent implementing TASK-068-D should update `dict.catalog.latestProducts` to reflect the "Featured" semantic decision.

---

## Migration Steps

1. TASK-069 + TASK-069-B can run in parallel (formatter is independent of dictionary)
2. TASK-069-A depends on TASK-069 (formatter must exist first)
3. TASK-069-C through TASK-069-J each depend on TASK-069-B (dictionary must exist first) and TASK-069-A for any file that displays prices
4. TASK-069-K is a final review of SEO/metadata (depends on C–J being done)
5. TASK-069-L is independent (store-api email) — can run in parallel with any frontend task
6. TASK-069-M is the verification gate — runs last

---

## Risks & Mitigations

| Risk                                                                                        | Mitigation                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ukrainian plural forms (1 товар / 2–4 товари / 5+ товарів) are complex                      | Use neutral phrasing for MVP ("Позиції: N", "Кількість: N") to avoid plural library dependency. Add `pluralUk` helper only if natural phrasing is required.         |
| `Intl.NumberFormat('uk-UA')` behaviour varies slightly across Node.js versions and browsers | Test with the actual Node.js version used in CI; output shape (`1 299 ₴` vs `1 299 ₴`) may use non-breaking space — unit tests must use ` ` or `trim()` comparisons |
| Pre-commit hook blocks `.env*` edits — developer cannot stage `.env` change                 | Document in TASK-069 acceptance criteria that `NEXT_PUBLIC_CURRENCY=UAH` must be set manually in `.env` (not committed); add to `.env.example` comment only         |
| Order-confirmation email changes break existing unit tests                                  | TASK-069-L is explicitly TDD: update the spec expectations first (Red), then update the template (Green)                                                            |
| TASK-068 (redesign) implementer starts before 040 is complete                               | Add a hard dependency comment to TASK-068 row in BACKLOG.md: "Blocked until TASK-069-M is ✅"                                                                       |

---

## Notes

- **Seed/demo data:** Product names and descriptions in the seed file are English (e.g., "iPhone 15 Pro Case"). This is content/data, not code — it is outside the scope of this plan. The localization plan only covers UI strings (labels, headings, buttons, validation messages, metadata). Product data Ukrainianization should be handled as a content task when the store goes live.
- **Status enum values** (PENDING, CONFIRMED, SHIPPED, etc.) are rendered verbatim from the backend in the order confirmation header. A translation map for status labels can be added in plan 039 or a future polish iteration.
- **`shared/config/site.ts` `SITE_NAME`** is `"MobileStore"` — a brand name, kept as-is.
- **Font:** The Geist font set in `layout.tsx` supports Cyrillic (Latin Extended + Cyrillic subset is included by default in Geist). No font change is needed.
- **`next.config.ts`** has no `i18n` block. Do not add one — App Router does not use the legacy `i18n` config, and we are not implementing locale-based routing.
