/**
 * Map a product colour axis VALUE (free-form display text like "Navy Blue" or
 * "Frosted Black") to a concrete CSS colour for rendering a swatch dot.
 *
 * Product colours are arbitrary DATA, not theme tokens, so the swatch palette
 * lives here in shared/lib (centralised, like `product-gradient.ts`) rather than
 * as raw hex in component markup. Components read the returned value into an
 * inline `style={{ backgroundColor }}`.
 *
 * Resolution order: exact (case-insensitive) match → first matching base-colour
 * token contained in the value (so "Navy Blue" → navy, "Frosted Black" → black)
 * → a neutral fallback for unrecognised values.
 */

/** Whether a swatch needs a visible ring because it blends with the card. */
export interface ColorSwatch {
  /** CSS colour for the dot background. */
  css: string;
  /** Light swatches (white/clear) need a darker ring to stay visible. */
  isLight: boolean;
}

const NEUTRAL = "#d1d5db"; // gray-300 — unknown colour fallback

// Base colour tokens, longest first so multi-word values resolve to the most
// specific token (e.g. "navy" before "blue").
const BASE_COLORS: Array<[token: string, css: string, isLight: boolean]> = [
  ["transparent", "#e5e7eb", true],
  ["midnight", "#0f172a", false],
  ["graphite", "#3a3a3c", false],
  ["charcoal", "#36454f", false],
  ["silver", "#c0c0c0", true],
  ["purple", "#7c3aed", false],
  ["violet", "#7c3aed", false],
  ["orange", "#f97316", false],
  ["yellow", "#eab308", false],
  ["green", "#16a34a", false],
  ["clear", "#e5e7eb", true],
  ["black", "#1a1a1a", false],
  ["white", "#f5f5f5", true],
  ["navy", "#1e3a8a", false],
  ["blue", "#2563eb", false],
  ["gold", "#d4af37", false],
  ["rose", "#b76e79", false],
  ["pink", "#ec4899", false],
  ["gray", "#9ca3af", false],
  ["grey", "#9ca3af", false],
  ["red", "#dc2626", false],
];

const EXACT: Record<string, [css: string, isLight: boolean]> =
  Object.fromEntries(
    BASE_COLORS.map(([token, css, isLight]) => [token, [css, isLight]]),
  );

/**
 * Resolve a colour value to a renderable swatch. Never throws; unknown values
 * resolve to a neutral grey so the dot always renders.
 */
export function colorSwatch(value: string): ColorSwatch {
  const key = value.trim().toLowerCase();

  const exact = EXACT[key];
  if (exact) {
    return { css: exact[0], isLight: exact[1] };
  }

  for (const [token, css, isLight] of BASE_COLORS) {
    if (key.includes(token)) {
      return { css, isLight };
    }
  }

  return { css: NEUTRAL, isLight: false };
}
