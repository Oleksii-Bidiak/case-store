# Storefront Design System (`apps/store-client`)

> Single source of truth for the storefront's visual language. Every UI change must
> consume these tokens — **never raw hex or arbitrary px values in markup**.
> Tokens live in `apps/store-client/src/app/globals.css` (Tailwind v4 `@theme inline`).
> Admin panel has its own shadcn theme; this doc covers the **customer storefront** only.

Distilled from the project's existing tokens plus best practices observed on
ivan-chohol.ua, ktc.ua and ash-mobile.com.ua (the Ukrainian accessory-shop benchmark)
and the polish bar of Apple Store / Stripe / Linear.

---

## 1. Design principles

1. **One primary action per screen.** The indigo `primary` button is reserved for the
   single most important action in a view (Buy / Add to cart / Checkout). Everything else
   is `secondary`, `outline`, or a link.
2. **Let products breathe, but keep commerce dense.** Generous whitespace around hero and
   section headings; tight, information-rich product cards (price, old price, discount %,
   variants, delivery hint) like the benchmark UA shops.
3. **Color is meaning, not decoration.** Indigo = brand/action, rose = sale/urgency, green
   = in-stock/success, amber = low-stock warning, red = error. Don't use a semantic color
   for anything but its meaning.
4. **Trust is a feature.** Surface delivery ETA, guarantee, secure-payment and installment
   cues — these drive conversion in this market.
5. **Motion is subtle and fast.** 150–250ms, ease-out, only to reinforce hierarchy (hover
   lift, fade-in). Always honour `prefers-reduced-motion`.

---

## 2. Color tokens

Use as Tailwind utilities: `bg-primary`, `text-primary-foreground`, `border-border`, etc.
Every color has light + dark values (dark via `prefers-color-scheme`). **Never** reference
the hex directly.

| Token                                    | Role                          | Light                             | Dark                              |
| ---------------------------------------- | ----------------------------- | --------------------------------- | --------------------------------- |
| `background` / `foreground`              | Page bg / default text        | `#ffffff` / `#0f172a`             | `#0a0a0a` / `#ededed`             |
| `primary` / `primary-foreground`         | Brand, primary CTA            | `#4f46e5` / `#fff`                | `#6366f1` / `#fff`                |
| `secondary` / `secondary-foreground`     | Secondary CTA                 | `#f4f4f5` / `#18181b`             | `#1e293b` / `#ededed`             |
| `muted` / `muted-foreground`             | Subtle bg / secondary text    | `#f1f5f9` / `#64748b`             | `#1e293b` / `#94a3b8`             |
| `accent` / `accent-foreground`           | Highlights, hover bg          | `#f1f5f9` / `#0f172a`             | `#1e293b` / `#ededed`             |
| `card` / `card-foreground`               | Card & popover surface        | `#ffffff` / `#0f172a`             | `#0f0f0f` / `#ededed`             |
| `popover` / `popover-foreground`         | Dropdowns, overlays           | `#ffffff` / `#0f172a`             | `#0f0f0f` / `#ededed`             |
| `sale` / `sale-foreground`               | Discount/urgency accent       | `#e11d48` / `#fff`                | `#f43f5e` / `#fff`                |
| `success` / `success-foreground`         | In stock, confirmed           | `#16a34a` / `#fff`                | `#22c55e` / `#052e16`             |
| `warning` / `warning-foreground`         | Low stock                     | `#d97706` / `#fff`                | `#f59e0b` / `#271100`             |
| `destructive` / `destructive-foreground` | Errors, delete                | `#ef4444` / `#fff`                | `#dc2626` / `#fff`                |
| `border` / `input` / `ring`              | Borders / inputs / focus ring | `#e2e8f0` / `#e2e8f0` / `#4f46e5` | `#334155` / `#334155` / `#6366f1` |
| `overlay`                                | Modal scrim                   | `rgba(0,0,0,.8)`                  | `rgba(0,0,0,.8)`                  |

**Usage rules**

- Body text: `text-foreground`; secondary/captions: `text-muted-foreground`.
- Price on sale: price in `text-sale`, original price `text-muted-foreground line-through`.
- Discount badge: `bg-sale text-sale-foreground`. "New": `bg-primary text-primary-foreground`.
- Stock: in-stock `text-success`, low-stock `text-warning`, out `text-muted-foreground`.
- Focus ring: rely on `ring`/`ring-ring` — never remove focus outlines.

---

## 3. Typography

Fonts (Next font vars, mapped in `@theme`): `font-sans` = Geist Sans (body/UI),
`font-display` = Sora → Geist fallback (headings/hero), `font-mono` = Geist Mono (SKUs, code).

| Role            | Classes                                                      | Notes                              |
| --------------- | ------------------------------------------------------------ | ---------------------------------- |
| Hero / display  | `font-display text-4xl md:text-6xl font-bold tracking-tight` | Homepage hero only                 |
| H1 (page title) | `font-display text-3xl md:text-4xl font-bold tracking-tight` | One per page                       |
| H2 (section)    | `font-display text-2xl md:text-3xl font-semibold`            | "Featured", "Related"              |
| H3 (card/block) | `text-lg font-semibold`                                      | Product card title, widget headers |
| Body            | `text-base leading-relaxed`                                  | Default copy                       |
| Small / meta    | `text-sm text-muted-foreground`                              | Captions, helper text              |
| Micro           | `text-xs`                                                    | Badges, legal, SKU                 |

Rules: max **one** `h1` per page; never skip heading levels; line length ≤ ~70ch for prose
(`max-w-prose`); prices use `tabular-nums` so columns align.

---

## 4. Spacing & layout

Stick to the Tailwind 4px scale — **no arbitrary values**. Allowed rhythm:
`1 (4px) · 2 (8px) · 3 (12px) · 4 (16px) · 6 (24px) · 8 (32px) · 12 (48px) · 16 (64px) · 24 (96px)`.

- **Page container:** `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8`.
- **Section vertical rhythm:** `py-12 md:py-16` (hero may go `py-20 md:py-28`).
- **Grid gaps:** cards `gap-4 md:gap-6`; form fields `gap-4`.
- **Card internal padding:** `p-4` (compact) / `p-6` (roomy).
- **Product grid:** `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4` (2-up on mobile
  matches the benchmark UA shops — denser than typical SaaS).
- **Sticky asides** (filter rails, summary panels, TOCs, side navs): the site header is
  `sticky top-0 z-50` (64px), so any other sticky panel must clear it with a **96px** top
  offset — `lg:sticky` + `STICKY_ASIDE_TOP` (`lg:top-24`) from
  `store-client/src/shared/config/layout.ts`; scroll-spy / `scrollTo` math uses
  `STICKY_HEADER_OFFSET` (96) from the same module. Never hardcode the offset.

---

## 5. Radius & elevation

| Token                        | Value            | Use                         |
| ---------------------------- | ---------------- | --------------------------- |
| `rounded-sm`                 | `radius − 4px`   | Badges, small chips         |
| `rounded-md`                 | `radius − 2px`   | Inputs, buttons             |
| `rounded-lg`                 | `0.75rem` (base) | Cards, dialogs, images      |
| `rounded-xl` / `rounded-2xl` | `+4 / +8px`      | Hero panels, feature blocks |

| Shadow            | Use                                                           |
| ----------------- | ------------------------------------------------------------- |
| `shadow-card`     | Resting product/info cards                                    |
| `shadow-elevated` | Dropdowns, popovers, sticky header on scroll                  |
| `shadow-lift`     | Card **hover** rise (pair with `-translate-y-0.5 transition`) |

---

## 6. Component states (every interactive element needs all five)

1. **Default** 2. **Hover** (lift/`accent` bg) 3. **Focus-visible** (`ring-2 ring-ring ring-offset-2`)
2. **Active/Loading** (spinner or skeleton — never a dead frozen UI) 5. **Disabled**
   (`opacity-50 cursor-not-allowed`, still readable).

- Use existing `shared/ui` primitives: `Button` (variants via CVA), `Badge`, `Input`,
  `Label`, `Select`, `Dialog`, `Sheet`, `Tabs`, `Skeleton`, `Separator`, Sonner toasts.
- **Loading** = skeletons that match final layout (already present: product-grid,
  product-detail, cart, checkout skeletons). Never a bare spinner for full-page loads.
- **Empty states** get an icon + one-line explanation + a primary action.
- **Errors** surface via Sonner toast or inline field message — never `alert()`/`confirm()`
  (use `Dialog`).

---

## 7. Motion

- Durations: micro `150ms`, standard `200–250ms`. Easing: `ease-out` for enter, `ease-in`
  for exit. Tailwind: `transition-* duration-200 ease-out`.
- Approved motions: hover lift on cards, fade/scale on dialogs & sheets (Radix defaults),
  fade-in on image load. No parallax, no auto-playing carousels that can't be paused.
- Always wrap non-essential motion so it's disabled under `prefers-reduced-motion: reduce`.

---

## 8. Accessibility checklist (part of "done")

- [ ] Keyboard: every action reachable & operable via Tab/Enter/Space/Esc.
- [ ] Visible `focus-visible` ring on all interactive elements.
- [ ] Contrast ≥ 4.5:1 text / 3:1 large text & UI borders (check sale-on-white, muted text).
- [ ] Images have meaningful `alt` (empty `alt=""` for decorative).
- [ ] Icon-only buttons have `aria-label` (wishlist heart, cart, close).
- [ ] Forms: `<Label htmlFor>`, errors linked via `aria-describedby`.
- [ ] One `h1`/page, logical heading order, landmarks (`header`/`nav`/`main`/`footer`).
- [ ] Skip-to-content link present (already added; keep it working).
- [ ] Respects `prefers-reduced-motion` and `prefers-color-scheme`.

---

## 9. Commerce UI patterns (the benchmark bar for this market)

Reusable patterns the storefront should converge on — pulled from the UA benchmark shops:

- **Product card:** image (4:3, `rounded-lg bg-muted` placeholder), New/Sale chips top-left,
  wishlist heart top-right, title (2-line clamp), rating stars + count, price block
  (sale price `text-sale` + old price struck), variant color dots, delivery hint, Add-to-cart.
- **Price block:** current `font-semibold text-lg tabular-nums`; if discounted, old price
  `text-sm text-muted-foreground line-through` + `bg-sale` "-XX%" chip; optional
  "від N ₴/міс" installment line in `text-xs text-muted-foreground`.
- **Trust strip:** 3–4 icon+label items (delivery, guarantee, secure payment, returns)
  under hero and on PDP/cart.
- **Badges:** `Sale` (`bg-sale`), `New` (`bg-primary`), `Bestseller`/`Хіт` (`bg-warning`),
  `Out of stock` (`bg-muted text-muted-foreground`).
- **PDP:** gallery + thumbnails, breadcrumb, variant selector, stock indicator, price block,
  Add-to-cart + sticky mobile ATC bar, trust badges, Description/Specs/Reviews tabs,
  related row.
- **Sticky header** with backdrop blur, prominent search, live cart count, wishlist count.

---

## 10. Don'ts

- ❌ Raw hex / arbitrary `[...]` values in markup.
- ❌ A semantic color used off-meaning (e.g. green for a non-success accent).
- ❌ More than one `primary` button competing in a single view.
- ❌ Removing focus outlines; icon buttons without `aria-label`.
- ❌ `window.alert` / `window.confirm` / native `prompt` — use Dialog/Sonner.
- ❌ Hardcoded English strings or `$` — use the dictionary + `formatMoney`.
- ❌ Editing generated API files or `.env*`.
