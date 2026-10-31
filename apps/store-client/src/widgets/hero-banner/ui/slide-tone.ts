/**
 * The tone of one hero slide (TASK-2013, direction В colour rule): a hue only
 * ever means a device family, or a sale. Everything else is the ink panel.
 */
export type SlideToneKey =
  "iphone" | "galaxy" | "redmi" | "watch" | "ipad" | "sale" | "ink";

export type SlideTone = {
  /** Slide surface + its text colour; the controls inherit `currentColor`. */
  surface: string;
  /** The CTA pill — a light pill on every tone. */
  cta: string;
  /**
   * Focus indicator for every control on the slide. The graphite ring
   * vanishes on the ink and sale panels, so every tone draws an outline in
   * its own text colour (white on ink; `foreground` on a family tone, which
   * flips with the theme exactly as the tone does).
   */
  focus: string;
};

/** Outline focus indicator in the given colour (full class names for the scan). */
const OUTLINE =
  "focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid";

const family = (surface: string): SlideTone => ({
  surface: `${surface} text-foreground`,
  cta: "bg-card text-foreground",
  focus: `${OUTLINE} focus-visible:outline-foreground`,
});

/**
 * Static lookup with full class names, so Tailwind's source scan sees every
 * one. The ink panel is the theme-invariant `footer` ink rather than
 * `primary`: since direction В primary turns near-white in dark, and the
 * graphite slide must stay graphite in both themes. Its pill is the
 * theme-invariant white for the same reason.
 */
export const SLIDE_TONES: Record<SlideToneKey, SlideTone> = {
  iphone: family("bg-family-iphone"),
  galaxy: family("bg-family-galaxy"),
  redmi: family("bg-family-redmi"),
  watch: family("bg-family-watch"),
  ipad: family("bg-family-ipad"),
  sale: {
    surface: "bg-sale text-sale-foreground",
    cta: "bg-card text-foreground",
    focus: `${OUTLINE} focus-visible:outline-sale-foreground`,
  },
  ink: {
    surface: "bg-footer text-footer-foreground",
    cta: "bg-footer-foreground text-footer",
    focus: `${OUTLINE} focus-visible:outline-footer-foreground`,
  },
};

/**
 * The admin banner `theme` → a slide tone. The family keys give the family
 * tone (as promo tiles do) and `sale` the sale panel. `primary`, `success`,
 * a custom value or none is the ink panel: the old by-position violet /
 * inverse / green gradients coloured slides for decoration only.
 */
export function slideToneFor(theme: string | null | undefined): SlideToneKey {
  const key = theme?.trim().toLowerCase();
  switch (key) {
    case "iphone":
    case "galaxy":
    case "redmi":
    case "watch":
    case "ipad":
    case "sale":
      return key;
    default:
      return "ink";
  }
}
