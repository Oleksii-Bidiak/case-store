# store-client storefront UI — conventions for building with this design system

A B2C mobile-accessories **storefront** (Ukrainian market) component library: React +
**Tailwind CSS v4** with **semantic design tokens**. Components are presentational ("dumb")
— they take data via props and render no business logic. Build screens by composing these
components and styling your own layout glue with the token-bound utility classes below.

## Setup

- **No provider/wrapper is required.** Import components from the bundle global and use
  them directly. They carry their own styles via `styles.css` (which imports the token
  layer + compiled utilities). Just make sure `styles.css` is loaded.
- **Theme: light by default.** The bundle sets `<html data-theme="light">` unless the page
  already chose a theme. For a dark mockup set `<html data-theme="dark">` — every token
  switches. Always paint the page with `bg-background text-foreground` (never a fixed
  white), so the surface follows the tokens in both themes.
- Components are **controlled / presentational**: pass data and handlers via props
  (e.g. `ProductCard` takes a `product` object; `PhoneInput`/`Combobox` are controlled).
- The fonts are real brand fonts loaded by `styles.css`, all with full Ukrainian Cyrillic:
  **Onest** (text, UI and prices), **Unbounded** (display — headings, hero, logo), **Geist
  Mono** (SKUs and codes only).
- **Visual direction «Кольоровий»**: a light lavender page (`bg-background`), white panels
  (`bg-card shadow-card`), round shapes (pills for buttons and chips), a graphite primary
  pill. Hue carries meaning only: a device family (`family-*`) or the product's own colour;
  categories stay neutral, sale is `sale`.

## Copy

- **All UI text is Ukrainian** ("Додати до кошика", "Оформити замовлення", "Немає в
  наявності"). Never ship English labels in a storefront screen.
- Money: `899 ₴`, thousands with a space — `1 198 ₴`. Order numbers: `#A1B2C3D4`.

## Styling idiom — Tailwind utilities bound to semantic tokens

NEVER hardcode hex colors. Style with these utility families; the color names are
semantic tokens (use each as `bg-<name>`, `text-<name>`, `border-<name>`):

| Family            | Names                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `background`, `foreground`, `card` (`card-foreground`), `popover` (`popover-foreground`), `muted` (`muted-foreground`), `accent` (`accent-foreground`)                                          |
| Brand / actions   | `primary` (`primary-foreground`) — graphite, light in dark; `secondary` (`secondary-foreground`); `badge` (`badge-foreground`) — coral cart / wishlist counters                                 |
| Device families   | `family-iphone` · `family-galaxy` · `family-redmi` · `family-watch` · `family-ipad` (tile tone, text `text-foreground`/`text-muted-foreground` on it) and `family-<f>-strong` (icon disc / dot) |
| Photo pads        | `bg-pad-1` … `bg-pad-4` — soft tint under a product photo                                                                                                                                       |
| Commerce status   | `sale` (`sale-foreground`), `success` (`success-foreground`), `warning` (`warning-foreground`), `destructive` (`destructive-foreground`)                                                        |
| Inactive / chrome | `disabled` (`disabled-foreground`) for inactive controls — never fade with `opacity-*`; `footer` (`footer-foreground`) for the footer & announcement bar (dark in both themes)                  |
| Lines / focus     | `border-border`, `border-input`; focus rings only as `focus-visible:ring-ring`                                                                                                                  |
| Radius            | roles: `rounded-panel` (32) · `rounded-card` (26) · `rounded-pad` (18) · `rounded-cta` (pill) · `rounded-menu` (16); scale `rounded-sm` … `rounded-2xl` (base `--radius` = 24px)                |
| Elevation         | `shadow-card` · `shadow-elevated` · `shadow-lift` (use `shadow-lift` on hover-raise)                                                                                                            |
| Fonts             | `font-sans` (Onest) · `font-display` (Unbounded — headings) · `font-mono` (Geist Mono — SKUs, codes)                                                                                            |

Examples: a page surface is `bg-background text-foreground`; a panel is
`bg-card text-card-foreground rounded-panel shadow-card`; a product card is `rounded-card` with a
`bg-pad-1 rounded-pad` photo pad; a price is `font-bold tabular-nums` in the text font and, when
discounted, `text-sale`.

## Commerce conventions

- **Badges**: `variant="sale"` for discount %, `variant="success"` for in-stock / «Новинка»,
  `variant="warning"` for low stock («Закінчується»), `variant="destructive"` for sold out.
- **Products**: `ProductCard` in grids (image/gradient fallback, sale & «Новинка» badges,
  rating, colour dots, price); `ProductThumb` for image-less thumbnails in rows (cart,
  order lines); `ColorDots` for a product's colour variants.
- **Ratings**: `RatingStars` for a product's average (`average` + `count`);
  `ReviewRatingStars` for one review's whole-number `rating`.
- **Lists**: `Pagination` (`currentPage`, `totalPages`, `buildHref`) for every paged list.
- **Content**: `RichText` renders admin-authored HTML (headings, lists, tables); `Logo` is
  the store mark; `Slider` is the two-thumb price range of the catalogue filters.
- **Buttons**: `variant` default (the one primary CTA per view — the graphite pill), `secondary`, `outline`,
  `ghost`, `destructive`, `link`; sizes `sm`/`default`/`lg` (+ `icon*`).
- **Confirmations** use `Dialog` (never a browser confirm); side panels use `Sheet`.

## Where the truth lives

Read `styles.css` (and the `_ds_bundle.css` it imports — that's where the `:root` tokens
live) before styling, and each component's `<Name>.prompt.md` + `<Name>.d.ts` for its API.

## Build snippet

```tsx
// A product grid cell with an add-to-cart action
<ProductCard
  product={product}
  action={<Button size="sm" className="w-full">Додати до кошика</Button>}
/>

// A labelled form field
<div className="grid gap-1.5">
  <Label htmlFor="phone">Телефон</Label>
  <PhoneInput id="phone" value={phone} />
</div>
```
