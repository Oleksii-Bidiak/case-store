# store-client storefront UI — conventions for building with this design system

A B2C mobile-accessories **storefront** component library: React + **Tailwind CSS v4**
with **semantic design tokens**. Components are presentational ("dumb") — they take
data via props and render no business logic. Build screens by composing these
components and styling your own layout glue with the token-bound utility classes below.

## Setup

- **No provider/wrapper is required.** Import components from the bundle global and use
  them directly. They carry their own styles via `styles.css` (which imports the token
  layer + compiled utilities). Just make sure `styles.css` is loaded.
- Components are **controlled / presentational**: pass data and handlers via props
  (e.g. `ProductCard` takes a `product` object; `PhoneInput`/`Combobox` are controlled).
- The fonts are real brand fonts loaded by `styles.css`: **Geist** (sans), **Geist Mono**,
  **Sora** (display — used for headings and prices).

## Styling idiom — Tailwind utilities bound to semantic tokens

NEVER hardcode hex colors. Style with these utility families; the color names are
semantic tokens (use each as `bg-<name>`, `text-<name>`, `border-<name>`):

| Family          | Names                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces        | `background`, `foreground`, `card` (`card-foreground`), `popover` (`popover-foreground`), `muted` (`muted-foreground`), `accent` (`accent-foreground`) |
| Brand / actions | `primary` (`primary-foreground`), `secondary` (`secondary-foreground`)                                                                                 |
| Commerce status | `sale` (`sale-foreground`), `success` (`success-foreground`), `warning` (`warning-foreground`), `destructive` (`destructive-foreground`)               |
| Lines / focus   | `border`, `input`, `ring`                                                                                                                              |
| Radius          | `rounded-sm` · `rounded-md` · `rounded-lg` · `rounded-xl` · `rounded-2xl` (base `--radius` = 0.75rem)                                                  |
| Elevation       | `shadow-card` · `shadow-elevated` · `shadow-lift` (use `shadow-lift` on hover-raise)                                                                   |
| Fonts           | `font-sans` (Geist) · `font-mono` · `font-display` (Sora — headings & prices)                                                                          |

Examples: a page surface is `bg-background text-foreground`; a panel is
`bg-card text-card-foreground rounded-xl shadow-card border border-border`; a price is
`font-display font-bold` and, when discounted, `text-sale`.

## Commerce conventions

- **Badges**: `variant="sale"` for discount %, `variant="success"` for in-stock / "New",
  `variant="warning"` for low stock, `variant="destructive"` for sold out.
- **Products**: use `ProductCard` (handles image/gradient fallback, sale & New badges,
  rating, price) in grids; `RatingStars` for ratings; `ProductThumb` for image-less thumbs.
- **Buttons**: `variant` default (primary CTA), `secondary`, `outline`, `ghost`,
  `destructive`, `link`; sizes `sm`/`default`/`lg` (+ `icon*`).

## Where the truth lives

Read `styles.css` (and the `_ds_bundle.css` it imports — that's where the `:root` tokens
live) before styling, and each component's `<Name>.prompt.md` + `<Name>.d.ts` for its API.

## Build snippet

```tsx
// A product grid cell with an add-to-cart action
<ProductCard
  product={product}
  action={<Button size="sm" className="w-full">Add to cart</Button>}
/>

// A labelled form field
<div className="grid gap-1.5">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>
```
