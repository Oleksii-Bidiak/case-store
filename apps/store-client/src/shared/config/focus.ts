// Focus indicator on dark surfaces (TASK-865).
//
// The house focus ring is `ring-ring` — brand indigo, translucent in `Button`.
// On the homepage's dark and indigo banners (hero slides, promo banner) that
// ring is indigo on indigo: keyboard focus on the page's CTA was invisible. A
// white outline pushed 2px off the control reads on every one of those
// backgrounds, and the gap keeps it apart from a white button, which a ring
// hugging the edge would only make look 2px bigger.

/**
 * Focus-visible classes for a control sitting on a dark or brand-coloured
 * banner. Merge over the control's own classes through `cn()` (or a `Button`
 * `className`) — it switches the indigo ring off and draws a white outline
 * with a 2px offset instead.
 */
/**
 * The house focus indicator (TASK-2079, ComponentStates.dc.html): a 2px
 * ring-coloured outline, 2px off the control, on `:focus-visible` only.
 * Outline rather than `ring`, so a hover ring or shadow never hides it. No
 * `outline-none` base — in Tailwind v4 it sets the outline style to `none`,
 * which the focus outline would then inherit, hence `outline-solid`.
 * Tiles and cards add `focus-visible:outline-offset-3`.
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

export const FOCUS_ON_DARK_CLASS =
  "focus-visible:border-white focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-white";
