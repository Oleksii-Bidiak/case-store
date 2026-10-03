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
   single most important **page-level** action in a view (Buy / Add to cart / Checkout).
   Everything else is `secondary`, `outline`, or a link. Allowed exceptions (owner decision
   7.4, audit 2026-09-24): the header chrome (cart button, search submit) and the «Купити»
   button on each product card — they repeat per item or per layout, not per page.
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
Every color has light + dark values. **Never** reference the hex directly.

**Theme mechanism.** The theme is owned by next-themes (`app/providers.tsx`,
`attribute="data-theme"`, `defaultTheme="system"`). The header switcher offers light / system /
dark. Light sets `data-theme="light"` and dark sets `data-theme="dark"` (`:root[data-theme='dark']`).
In "system" there is no `data-theme`, and only then does `@media (prefers-color-scheme: dark)`
decide (`:root:not([data-theme='light'])`). Tailwind's `dark:` variant follows the same
attribute. The two dark blocks in `globals.css` must stay in sync.
The browser chrome follows the same rule: `viewport.themeColor` is a static
`prefers-color-scheme` pair (first paint, "system"), and on an explicit light / dark choice
`features/theme` `ThemeColorSync` puts its own media-less `theme-color` meta first in `<head>`
(values from `THEME_COLOR` in `shared/config/theme.ts`).

| Token                                    | Role                          | Light                             | Dark                              |
| ---------------------------------------- | ----------------------------- | --------------------------------- | --------------------------------- |
| `background` / `foreground`              | Page bg / default text        | `#ffffff` / `#0f172a`             | `#0a0a0a` / `#ededed`             |
| `primary` / `primary-foreground`         | Brand, primary CTA            | `#4f46e5` / `#fff`                | `#6366f1` / `#fff`                |
| `secondary` / `secondary-foreground`     | Secondary CTA                 | `#f4f4f5` / `#18181b`             | `#1e293b` / `#ededed`             |
| `muted` / `muted-foreground`             | Subtle bg / secondary text    | `#f1f5f9` / `#64748b`             | `#1e293b` / `#94a3b8`             |
| `disabled` / `disabled-foreground`       | Inactive control bg / text    | `#f1f5f9` / `#475569`             | `#1e293b` / `#94a3b8`             |
| `accent` / `accent-foreground`           | Highlights, hover bg          | `#f1f5f9` / `#0f172a`             | `#1e293b` / `#ededed`             |
| `card` / `card-foreground`               | Card & popover surface        | `#ffffff` / `#0f172a`             | `#0f0f0f` / `#ededed`             |
| `popover` / `popover-foreground`         | Dropdowns, overlays           | `#ffffff` / `#0f172a`             | `#0f0f0f` / `#ededed`             |
| `sale` / `sale-foreground`               | Discount/urgency accent       | `#e11d48` / `#fff`                | `#f43f5e` / `#fff`                |
| `success` / `success-foreground`         | In stock, confirmed           | `#16a34a` / `#fff`                | `#22c55e` / `#052e16`             |
| `warning` / `warning-foreground`         | Low stock                     | `#d97706` / `#fff`                | `#f59e0b` / `#271100`             |
| `destructive` / `destructive-foreground` | Errors, delete                | `#ef4444` / `#fff`                | `#dc2626` / `#fff`                |
| `border` / `input` / `ring`              | Borders / inputs / focus ring | `#e2e8f0` / `#e2e8f0` / `#4f46e5` | `#334155` / `#334155` / `#6366f1` |
| `overlay`                                | Modal scrim, banner veil      | `rgba(0,0,0,.8)`                  | `rgba(0,0,0,.8)`                  |
| `footer` / `footer-foreground`           | Footer & announcement bar     | `#0f172a` / `#ffffff`             | same (theme-invariant, F-06)      |

**Usage rules**

- Body text: `text-foreground`; secondary/captions: `text-muted-foreground`.
- Price on sale: price in `text-sale`, original price `text-muted-foreground line-through`.
- Discount badge: `bg-sale text-sale-foreground`. "New": `bg-primary text-primary-foreground`.
- Stock: in-stock `text-success`, low-stock `text-warning`, out `text-muted-foreground`.
- Focus ring: rely on `ring`/`ring-ring` — never remove focus outlines. On a dark or
  brand-coloured banner (hero slides, promo banner) the indigo ring is indigo on indigo: merge
  `FOCUS_ON_DARK_CLASS` (`shared/config/focus.ts`) instead — a white outline 2px off the control
  (TASK-865).
- Footer and announcement bar: `bg-footer text-footer-foreground` — a dark panel in both themes.
- **No Tailwind palette colours** (`text-violet-500`, `bg-slate-900/60`, …) and no inline
  `color-mix()` styles for a tint (TASK-879). A tint is the token plus an opacity modifier over
  its surface: `bg-primary/10` for an active menu item, `bg-primary/15` for an avatar disc. Over
  `bg-card` that gives the same pixels as `color-mix(in oklab, var(--color-primary) N%,
var(--color-card))`. Decoration with no meaning (the hero category-rail dots, an icon tile for
  a topic) takes the brand tint, never a semantic colour picked for variety. A switch thumb is
  `bg-primary-foreground`. The veil over an admin banner picture is `bg-overlay/75` (black at
  60 % in both themes). The same holds for arbitrary values (`bg-[color-mix(…)]`,
  `[background:color-mix(…)]`) and for raw `oklch(…)` in a widget: an icon tile is
  `bg-primary/12`, a success disc `bg-success/16`, an active TOC row `bg-primary/7`. A gradient
  that several screens share is a token in `globals.css` — the brand gradient (primary deepening
  to violet: the `/contact` hero, the `/info` «Про нас» panel, the 404 numeral with
  `bg-clip-text text-transparent`) is `bg-brand-gradient`. `shared/config/color-tokens.test.ts`
  fails on any palette utility, `color-mix(` or `oklch(` in `src` outside the files it tracks by
  backlog row.
- **Order & payment status colours** — one map, rendered with `Badge` everywhere (`/orders`,
  order confirmation, `/orders/status`, guest order view):

  | Status group                                          | Colour                       |
  | ----------------------------------------------------- | ---------------------------- |
  | In progress (pending, confirmed, processing, shipped) | shades of `primary`          |
  | `DELIVERED`, `PAID`                                   | `success`                    |
  | `REFUNDED`, `PARTIALLY_REFUNDED`                      | `muted` / `muted-foreground` |
  | `CANCELLED`, `FAILED`                                 | `destructive`                |

  The map is `STATUS_BADGE` in `entities/order/lib/status-badge.ts`, and every one of the four
  screens renders it through `OrderStatusBadge` (`entities/order`), which is the `shared/ui`
  `Badge` with `size="pill"` and `dot` (TASK-868). The four in-progress stages share the
  `tint-primary` variant and get darker step by step (`/10` → `/15` → `/20` → `/30`). The
  colour sits in the **tint and the leading dot only**. The label is always `text-foreground`,
  because role-coloured `text-xs` on its own tint is below 4.5:1 with the current tokens
  (light: success ≈3.0, destructive ≈3.3; dark: primary ≈3.9, destructive ≈3.7). Foreground on
  any of the tints is ≥ 9:1, and each dot is ≥ 3:1 against the page in both themes. The badge
  is named by an `sr-only` `<dt>` (or an `sr-only` prefix where no `<dl>` is around it), never
  by an `aria-label` on the `<span>`. The `Badge` variants are `tint-primary`, `tint-success`,
  `tint-destructive` and `tint-muted`. Use them for any other status pill too.

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

Rules:

- The H1 and H2 rows are **mandatory**. Page titles and section headings use exactly these
  classes and no per-page `text-[..px]` (owner decision 7.5). Don't type the lists by hand:
  import `H1_CLASS`, `H2_CLASS` and `HERO_CLASS` from `@/shared/config`
  (`shared/config/typography.ts`) and add only colour and spacing next to them
  (``className={`mb-6 ${H1_CLASS} text-foreground`}``). Banners on a gradient leave the colour
  off and inherit white. `typography.test.ts` fails the build on any `h1` without `H1_CLASS`
  and on any `h1`/`h2` with an arbitrary `text-[..]` (TASK-861).
- **Section vs card headings.** H2 is for headings that open a region of the page: rails,
  grids, «Схожі статті», banners, the homepage sections. A card or panel title (the cart
  summary, the account panels, the contact cards) is often an `h2` in the outline because it
  sits directly under the h1. It still keeps the H3 role sizing from the scale (`text-lg` …
  `text-2xl`, no `md:` bump), so it never outranks the sections around it.
- The Hero row is for the homepage slider only. The decorative «404» numeral on the
  not-found page is not a heading: it uses the top of the scale (`text-8xl sm:text-9xl`), and
  the 404 `h1` follows the H1 row.
- Max **one** `h1` per page, and never skip heading levels.
- Line length ≤ ~70ch for prose (`max-w-prose`).
- **Text sizes come only from the scale** (`text-xs` … `text-6xl`). The half-steps `13.5 / 14.5
/ 12.5 / 11.5px` are not allowed (owner decision 7.10). They were folded onto the nearest step
  in one pass (TASK-863): `13.5 / 14.5` → `text-sm`, `12.5 / 11.5` → `text-xs`.
  `typography.test.ts` fails the build if one comes back.
- **Hand-rolled form fields** (the raw `<input>`/`<textarea>` of `/contact`, `/info` and the
  blog search) use `text-base md:text-sm`, like `shared/ui/input`. `/orders/status` is on the
  `Input` / `PhoneInput` / `Label` / `Button` primitives since TASK-872.
  Below 16px iOS Safari zooms the page on focus.
- **Price figures use `font-mono` (Geist Mono)**. This is the house equivalent of `tabular-nums`,
  so columns of prices align.

---

## 4. Spacing & layout

Stick to the Tailwind 4px scale — **no arbitrary values**. Allowed rhythm:
`1 (4px) · 2 (8px) · 3 (12px) · 4 (16px) · 6 (24px) · 8 (32px) · 12 (48px) · 16 (64px) · 24 (96px)`.

- **Page container:** one width token of **1320px** for every page, the header and the footer
  (owner decision 7.1). The token is `--container-page: 1320px` in `@theme inline`
  (globals.css), which Tailwind turns into the utility `max-w-page`. Don't write the classes by
  hand: import `PAGE_CONTAINER` from `@/shared/config` (`shared/config/layout.ts`), which is
  `mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8`, and add only the vertical padding next to it
  (``className={`${PAGE_CONTAINER} py-8`}``). Every page, every `loading.tsx`, the header, the
  announcement bar, the footer and every homepage section use it (TASK-860). No `max-w-7xl` and
  no `max-w-[…px]` page shells.
- **Inner widths** are not containers. They sit inside the page container, centred with
  `mx-auto`, so the outer gutter stays the same on every page:

  | Content                            | Width       |
  | ---------------------------------- | ----------- |
  | Article prose                      | 760px       |
  | Legal / info document (TOC + text) | `max-w-6xl` |
  | Legal hub (`/legal`)               | `max-w-5xl` |
  | Auth forms                         | `max-w-md`  |
  | Order lists (`/orders`, …)         | `max-w-3xl` |
  | 404 block                          | 560px       |

- **Section vertical rhythm:** `py-12 md:py-16` (hero may go `py-20 md:py-28`).
- **Grid gaps:** cards `gap-4 md:gap-6`; form fields `gap-4`.
- **Card internal padding:** `p-4` (compact) / `p-6` (roomy).
- **Product grid:** `grid grid-cols-1 items-stretch min-[390px]:grid-cols-2 lg:grid-cols-4`
  — **1 / 2 / 4 columns** (owner's call, TASK-415). One card below 390px: on the narrowest
  phones a 2-up row left the photo, the price and the button all unreadable. Two cards from
  390px (2-up matches the benchmark UA shops — denser than typical SaaS), four from `lg`.
  This supersedes both the old auto-fill `minmax(232px,1fr)` layout and the always-2-up rule
  of TASK-259 (F-19). `min-[390px]` is deliberate: 390px is the design viewport, not a
  Tailwind breakpoint. `items-stretch` (+ `h-full` on the card root) keeps every card in a
  row the same height. The same grid is used on `/products`, `/search` and `/wishlist`, and
  each **skeleton must repeat the class list byte for byte** — a skeleton with different
  columns reflows the page the moment real cards replace it.
- **Product card image:** a fixed `aspect-square` box with `object-contain` over the card
  gradient — accessory photos arrive in mixed aspect ratios and must never be cropped
  (TASK-415). The PDP gallery follows the same rule — the main frame and every 64px thumbnail
  are square boxes over the product gradient (`pickProductGradient`, seeded like its
  placeholder) with the photo `object-contain` inside; the lightbox is `object-contain` too
  (TASK-518, TASK-416) at every zoom level. The lightbox (`entities/product/ui/product-lightbox.tsx`,
  TASK-521) zooms 100 → 150 → 250 → 400 % from a `role="toolbar"` of 44px frosted buttons
  (top-right from `sm`, in the footer above 56px thumbnails on phones, where there are no arrows),
  by click / double tap into the pointer and by pinch; zoomed, it pans by drag, one finger or the
  arrow keys, hides the arrows, shows an `aria-hidden` minimap, and Escape resets before it
  closes. The zoom/pan math is pure (`entities/product/lib/lightbox-zoom.ts`) and the eased
  transform is off while a gesture drives it and under `prefers-reduced-motion`. Banners and category tiles keep `object-cover`: there the frame
  matters more than the edges of the subject.
- **Sticky asides** (filter rails, summary panels, TOCs, side navs): the site header is
  `sticky top-0 z-50` (64px), so any other sticky panel must clear it with a **96px** top
  offset — `STICKY_ASIDE_TOP` (`top-24`) from `store-client/src/shared/config/layout.ts`,
  paired with the breakpoint-prefixed `sticky` of the layout (`lg:sticky` on two-column
  pages, `md:sticky` on the PDP buy box). The token carries no breakpoint: below the
  `sticky` breakpoint the aside is not positioned and `top` is inert, so such an aside
  must not also be `relative`/`absolute`. Scroll-spy / `scrollTo` math uses
  `STICKY_HEADER_OFFSET` (96) from the same module. Never hardcode the offset. An aside that can
  be taller than the screen (the catalogue and search filter rails) also takes
  `max-h-sticky-aside overflow-y-auto overscroll-contain`. The `--max-height-sticky-aside`
  token is the viewport minus that 96px offset and a 16px gap, so the aside scrolls inside
  itself instead of running off a short laptop screen.
- **Content pages at 390** (TASK-878): a document TOC that is a side column from `lg`
  collapses below `lg` into one disclosure row «Зміст документа · N розділів»
  (`aria-expanded`/`aria-controls`, folds back after a jump); a document card is `px-4 py-6`
  on a phone (≥320px of text at 390), the roomy padding only from `sm`. Coloured hero blocks step padding up with the
  viewport (`p-6 sm:p-8 lg:p-11`), never a flat desktop value. Media frames take an
  `aspect-*` ratio, not a fixed pixel height; the homepage slider takes its height from its
  tallest slide (invisible `inert` sizers in one grid cell) above a `min-h-*`, so it never
  jumps between slides — from `lg`, beside the category sidebar, it is pinned at `lg:h-110`
  so the row does not stretch it — and on a phone its arrows join the bottom control row.
- **Mobile sticky bar** (below `md`): the primary action of a long page is pinned to the bottom
  edge. This covers the PDP `MobileAtcBar` (price + add to cart), plus the cart and checkout
  («До сплати» + CTA, owner decision 7.6, TASK-864). The PDP still reserves room with
  `pb-24 md:pb-0` on its content; the cart and checkout bar marks itself `data-mobile-bar`, and
  `globals.css` pads `<body>` (`body:has([data-mobile-bar])`, below `md`) — the band sits AFTER
  the footer, so at the end of the scroll the bar covers neither the last block nor the footer's
  payment chips. New bars should take the marker, not a page padding. Cart and checkout wrap their
  own CTA in `MobilePayBar` (`shared/ui`): below `md` it is the fixed bar, from `md` up it
  dissolves (`md:contents`) and the CTA renders in place, so a page never shows two primaries
  and never ships a duplicate control. A bar never contradicts the
  page's main CTA: the PDP bar renders the buy box's own in-cart control (`ProductInCartButton`
  — «В кошику» / «Товар закінчився», opens the mini-cart) once the cart holds the position
  (TASK-874).

---

## 5. Radius & elevation

Radii follow what the storefront actually renders (owner decision 7.9):

| Role                          | Radius           | Today in code  |
| ----------------------------- | ---------------- | -------------- |
| Card (product, info, order)   | 18px             | `rounded-card` |
| Large CTA                     | 13px             | `rounded-cta`  |
| Menu item                     | 11px             | `rounded-menu` |
| Hero banner                   | `radius + 8px`   | `rounded-2xl`  |
| Chip / pill                   | full             | `rounded-full` |
| Inputs, buttons (`shared/ui`) | `radius − 2px`   | `rounded-md`   |
| Badges, small chips           | `radius − 4px`   | `rounded-sm`   |
| Dialogs, images               | `0.75rem` (base) | `rounded-lg`   |

The 18 / 13 / 11 values are the named tokens `--radius-card`, `--radius-cta` and
`--radius-menu` in `@theme inline` (`globals.css`, TASK-862). The card radius covers the whole
funnel: cart, checkout, order confirmation, `/orders`, `/orders/status` and the guest order
view all use `rounded-card`. New code picks the role from this table and does not invent a
new radius: no `rounded-[..px]`.

Tailwind v4 emits the radius utilities in alphabetical order (`card`, `cta` come before `lg`,
`md`, `xl`), so when a role radius and a scale radius land on one element the scale one wins.
Override a component's default radius through `cn` (`shared/lib/utils.ts`), which registers
`card` / `cta` / `menu` with tailwind-merge and drops the default. Never join class strings by
hand when a radius can come from both sides.

| Shadow            | Use                                                           |
| ----------------- | ------------------------------------------------------------- |
| `shadow-card`     | Resting product/info cards                                    |
| `shadow-elevated` | Dropdowns, popovers, sticky header on scroll                  |
| `shadow-lift`     | Card **hover** rise (pair with `-translate-y-0.5 transition`) |

---

## 6. Component states (every interactive element needs all five)

1. **Default** 2. **Hover** (lift/`accent` bg) 3. **Focus-visible** (`ring-2 ring-ring ring-offset-2`)
2. **Active/Loading** (spinner or skeleton — never a dead frozen UI) 5. **Disabled**
   (explicit tokens + `cursor-not-allowed` — **never `opacity-*`**, see below).

**Disabled rule (TASK-736).** Paint the inactive state with the `disabled` tokens, never by
fading the control: `opacity-50` over text that is already grey gave ≈2.0:1
(`muted-foreground`) / ≈3.4:1 (`foreground`), unreadable. What the `shared/ui` primitives do:

| Control                              | Disabled classes                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `Button` (filled / outline variants) | `disabled:bg-disabled disabled:text-disabled-foreground disabled:shadow-none`                           |
| `Button` `ghost` / `link`            | the above + `disabled:bg-transparent` (no box appears where there was none)                             |
| `Input`, `Textarea`                  | the `Button` set + `disabled:placeholder:text-disabled-foreground`                                      |
| `Select` trigger / item              | trigger as `Input` (+ `disabled:data-[placeholder]:…`); item `data-[disabled]:text-disabled-foreground` |
| `TabsTrigger`                        | `disabled:text-disabled-foreground` (sits on the `bg-muted` list)                                       |
| `Label`                              | `peer-disabled:` / `group-data-[disabled=true]:text-disabled-foreground`                                |

Borders keep their enabled token (`border-input`); WCAG exempts inactive controls from the
3:1 UI-component rule, and the grey fill already marks the state. `text-disabled-foreground`
is ≥ 4.5:1 on `disabled`, `background`, `card`, `popover` and `muted` in both themes
(light 6.92:1 on `disabled`, 7.58:1 on white; dark 5.71:1 on `disabled`, 7.72:1 on
`background`) — pinned by `apps/store-client/src/app/globals-disabled-contrast.test.ts`.
New disabled styling anywhere on the storefront uses these tokens, not opacity; decorative
icons (e.g. the select chevron) may keep an opacity since they carry no text.

- Use the existing `shared/ui` primitives. `apps/store-client/src/shared/ui/index.ts` exports
  **57 components** — the 56 the Claude Design system last synced plus `AccountDropdownSeparator`
  (TASK-503), which joins on the next `/design-sync`. Most of them are compound parts:
  - **Controls:** `Button` (CVA variants), `Input`, `Textarea`, `Label`, `Select` (+ parts),
    `Combobox`, `PhoneInput`, `Slider`.
  - **Overlays:** `Dialog` (+ parts) and `Sheet` (+ parts).
  - **Navigation & structure:** `Tabs` (+ parts), `Pagination`, `Separator`, `AccountDropdown`
    / `AccountDropdownItem` / `AccountDropdownSeparator`.
  - **Commerce:** `ProductCard`, `ProductCardImage`, `ProductThumb`, `CategoryTileImage`,
    `ColorDots`, `RatingStars`, `ReviewRatingStars`, `Badge`, `Logo` (takes a required
    `siteName` — the server-resolved `resolveSiteName(seo)`, never the `SITE_NAME` constant).
  - **Content & feedback:** `RichText`, `Skeleton`, `CheckoutSkeleton`, and the Sonner `Toaster`.
- **Anchored popups are Radix, portalled, collision-aware.** `SelectContent` uses popper
  positioning (TASK-459). The `Combobox` list is a Radix `Popover` anchored to its input
  (TASK-502): portalled to `<body>`, so no `overflow` ancestor clips it; `side="bottom"`,
  `sideOffset={4}`, `collisionPadding={8}`, as wide as the input; height `max-h-listbox`. The
  `--max-height-listbox` token is the 15rem list, shrunk to the room on the opened side, with a
  7.5rem floor. The floor is what lets the list flip above the input near the bottom of a phone
  screen: a cap equal to that sliver would clamp the async results to it, the list would never
  overflow, and collision detection would never move it. DOM focus stays on the input
  (`aria-activedescendant`). The header `AccountDropdown` is a Radix `DropdownMenu` (TASK-503):
  portalled, `align="end"`, `sideOffset={4}`, `collisionPadding={8}`, height capped at
  `--radix-dropdown-menu-content-available-height` with its own scroll, `modal={false}` (no
  scroll lock, an outside click reaches its target). Keyboard per the APG menu button; Tab closes
  it and moves on to the trigger's Tab neighbour. Items render only inside it. Never hand-roll an
  `absolute` dropdown for a new picker or menu.
- **RadioGroup and Checkbox are not `shared/ui` components.** They are native `<input
type="radio|checkbox">` elements styled with tokens where they are used (checkout payment,
  filters, cart rows, forms). Keep them native: the browser gives keyboard and form semantics for
  free.
- **Loading** = skeletons that match the final layout. Never a bare spinner for full-page loads.
  A `loading.tsx` skeleton and a Suspense fallback must render the **same** container
  and vertical padding, breadcrumbs, heading slot (`h-9 md:h-10` per H1_CLASS line; the checkout
  stepper too) and grid as the page they stand in for. A skeleton with a different width or column
  count reflows the page when the content lands (parity fixes: TASK-869). A skeleton draws only
  the controls a shopper gets by default — nothing for flag-gated stubs. And a `loading.tsx`
  must never be an **ancestor** of a different page: Next prefetches a dynamic route "layout to
  first loading boundary", so a parent's skeleton becomes the shell of every child link. Scope a
  listing's boundary with a route group (`app/products/(catalog)/loading.tsx`, TASK-832).
  A boundary also flushes its shell with a 200, so a page under it cannot answer 404 / 308 by
  itself: decide a dead or renamed slug in the segment's `layout.tsx`, which sits **above** its
  own `loading.tsx`, and skip that check for the router's own `fetch` requests
  (`Sec-Fetch-Dest: empty`) so card prefetches cost no API read (`app/products/[slug]/layout.tsx`,
  TASK-874).
- **Empty states** get an icon + one-line explanation + a primary action. One card everywhere
  (TASK-870): `rounded-card` + `shadow-card`, a `size-18` `bg-muted` disc with the glyph
  (`aria-hidden`), a `text-xl` display line, one muted helper line, a 44 px primary
  (`features/product-filters` `ListingEmptyState` for product listings; the content hubs
  `/blog`, `/legal`, `/categories` and `/orders` draw the same card locally). The action is the
  way on from _this_ emptiness: a reset only when a filter or a query narrowed the list,
  otherwise a link out (the catalogue, page 1, support). The page keeps its crumbs and H1 above
  the card. If the page already has a primary with the same job (the `/legal` support card),
  the empty card takes it over and the other block is not rendered: never two primaries.
- **Errors** surface via Sonner toast or inline field message — never `alert()`/`confirm()`
  (use `Dialog`).
- **A page that fails to render** lands in `app/error.tsx`, inside the layout's `<main>` so the
  header and footer stay: the empty-state shape (muted icon circle, `H1_CLASS`, one muted line),
  one primary «Спробувати ще раз» calling `retry()` (re-fetches server data, unlike `reset()`), an
  outline «На головну», and the Next digest as «Код помилки» for support. `global-error.tsx` is
  only for a broken root layout — no providers, plain elements, same `dict.common` strings
  (TASK-880).

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
- [ ] Visible `focus-visible` ring on all interactive elements. `outline-none` is allowed
      **only** together with a `focus-visible:ring-*` replacement on the same element.
- [ ] Contrast ≥ 4.5:1 text / 3:1 large text & UI borders (check sale-on-white, muted text).
- [ ] Images have meaningful `alt` (empty `alt=""` for decorative).
- [ ] Icon-only buttons have `aria-label` (wishlist heart, cart, close).
- [ ] Touch targets are at least 44×44 (`min-h-11 min-w-11`, or `size-11` for a fixed icon
      button), icon-only header actions included. A control that changes with state keeps one
      box: the header «Кабінет» is the same 44×44 target (caption from `xl`) for a guest, for
      a signed-in customer and as its loading skeleton (TASK-499/511).
- [ ] Forms: `<Label htmlFor>`, errors linked via `aria-describedby`.
- [ ] Required consent (registration, checkout confirm — TASK-871/882): never a silently
      disabled submit. The button stays enabled; pressing it unticked shows the reason as a
      `role="alert"` message tied to the checkbox (`aria-invalid` + `aria-describedby`) and
      moves focus onto the box. Document links sit outside the `<label>` and open a new tab.
- [ ] One `h1`/page, logical heading order, landmarks (`header`/`nav`/`main`/`footer`).
- [ ] Skip-to-content link present (already added; keep it working).
- [ ] Respects `prefers-reduced-motion` and `prefers-color-scheme`.

---

## 9. Commerce UI patterns (the benchmark bar for this market)

Reusable patterns the storefront should converge on — pulled from the UA benchmark shops:

- **Product card:** image (square box, `object-contain` over the gradient placeholder — §4),
  New/Sale chips top-left, wishlist heart top-right, title (2-line clamp), rating stars +
  count, price block (sale price `text-sale` + old price struck), variant color dots,
  delivery hint, Add-to-cart.
- **Price block:** current `font-semibold text-lg tabular-nums`; if discounted, old price
  `text-sm text-muted-foreground line-through` + `bg-sale` "-XX%" chip; optional
  "від N ₴/міс" installment line in `text-xs text-muted-foreground`.
- **Trust strip:** 3–4 icon+label items (delivery, guarantee, secure payment, returns)
  under hero and on PDP. In the cart and checkout it sits **under the order summary** (owner
  decision 7.6, TASK-864).
- **Product grids** everywhere, including `/promo`, use the 1 / 2 / 4 grid from §4. The old
  auto-fill promo grid is being retired (TASK-501/536).
- **Badges:** `Sale` (`bg-sale`), `New` (`bg-primary`), `Bestseller`/`Хіт` (`bg-warning`),
  `Out of stock` (`bg-muted text-muted-foreground`).
- **PDP:** gallery + thumbnails, breadcrumb, variant selector, stock indicator, price block,
  Add-to-cart + sticky mobile ATC bar, trust badges, Description/Specs/Reviews tabs,
  related row. «Сумісні аксесуари» (compatible accessories) is a horizontal **rail under the
  tabs**, not a grid.
- **Sticky header** with backdrop blur, prominent search, live cart count, wishlist count.

---

## 10. Don'ts

- ❌ Raw hex / arbitrary `[...]` values in markup.
- ❌ A semantic color used off-meaning (e.g. green for a non-success accent).
- ❌ More than one page-level `primary` button competing in a single view. Header chrome and
  the per-card «Купити» are the allowed exceptions (§1).
- ❌ Removing focus outlines; icon buttons without `aria-label`.
- ❌ `window.alert` / `window.confirm` / native `prompt` — use Dialog/Sonner.
- ❌ Hardcoded English strings or `$` — use the dictionary + `formatMoney`.
- ❌ Editing generated API files or `.env*`.

---

## 11. Mockups (Claude Design)

- **Where:** the storefront mockups live in the Claude Design project «store-client — Pages».
  It binds its own copy of this design system under `_ds/`, refreshed after every
  `/design-sync` (procedure: `.design-sync/NOTES.md` → Re-sync risks). The components and
  tokens come from «store-client Design System», which is compiled from `shared/ui` and
  `globals.css`.
- **Artboards:** every screen gets two artboards, desktop **1440** and mobile **390**. The
  **light theme** is primary, and dark is a switch. The artboards use the 1320px container
  token (§4) and the type and radius scales from §3 and §5 — tokens from `_ds`, no private hex.
- **An artboard shows only what exists in code.** A parity artboard reproduces the implemented
  screen and never "improves" it. A difference from the code is a defect of the artboard.
  New features are drawn in the dedicated new-screen sessions (Д-н in plan 189), not slipped
  into parity artboards.
- Mock product data must carry `inStock` like the real `PublicProductEntity`. Without it
  `ProductCard` renders every item as «Немає в наявності».
