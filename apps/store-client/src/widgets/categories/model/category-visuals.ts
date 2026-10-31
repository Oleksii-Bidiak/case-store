// Tile cover gradients for the /categories page — a token-driven oklch
// gradient per tile index, no invented data, no raw hex.
//
// Since TASK-083 this is explicitly the FALLBACK tier: tiles render the
// admin-set `Category.image` (via `shared/ui` CategoryTileImage) when present
// and loadable, and only fall back to the category icon + gradient when the
// image is missing or fails to load. The icon itself is the admin-chosen
// `Category.icon` from the shared sprite (`shared/ui` CategoryIcon, TASK-1956)
// — no keyword guessing; a category without one gets the generic folder.

// Cycled hues for the tile cover gradients (token-driven oklch, theme-following).
const GRADIENT_HUES = [265, 200, 40, 150, 320, 25, 285, 175, 235, 305, 120, 90];

/** Token-driven cover gradient for a tile at `index`. */
export function categoryGradient(index: number): string {
  const hue = GRADIENT_HUES[index % GRADIENT_HUES.length];
  return `linear-gradient(140deg, oklch(0.7 0.16 ${hue}), oklch(0.55 0.19 ${hue}))`;
}
