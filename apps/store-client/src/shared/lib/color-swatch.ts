/**
 * Map a product colour axis VALUE (free-form display text like "Navy Blue",
 * "Frosted Black" or "Темно-синій") to a concrete CSS colour for rendering a
 * round swatch.
 *
 * Product colours are arbitrary DATA, not theme tokens, so the swatch palette
 * lives here in shared/lib (centralised, like `product-gradient.ts`) rather than
 * as raw hex in component markup. Components read the returned value into an
 * inline `style={{ background }}` — `css` is a CSS *background* value, so the
 * unknown-colour fallback can be a subtle gradient rather than a wrong colour.
 *
 * Resolution order: exact (case-insensitive) token match → longest matching
 * token contained in the value (so "Navy Blue" → navy, "Space Gray" → space
 * gray, "Frosted Black" → black, "Темно-синій" → navy) → a neutral gradient
 * fallback for unrecognised values. Ukrainian tokens are stems (e.g. "чорн"),
 * so inflected forms (чорний / чорна / чорне / чорні) all resolve. Never throws.
 */

export interface ColorSwatch {
  /** CSS background value for the swatch (colour, or a gradient for unknown). */
  css: string;
  /** Light swatches (white/clear/pastels) need a darker ring to stay visible. */
  isLight: boolean;
  /** True when the value did not resolve — callers may style it as neutral. */
  isUnknown?: boolean;
}

/** Neutral gradient fallback — clearly "no specific colour", never a wrong one. */
const UNKNOWN_SWATCH: ColorSwatch = {
  css: "linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)", // gray-200 → gray-400
  isLight: true,
  isUnknown: true,
};

/**
 * Colour tokens: `[token, css, isLight]`. English names plus Ukrainian STEMS
 * (matching all adjective inflections), plus Apple finish names. Matching picks
 * the LONGEST token contained in the value, so multi-word tokens ("space gray",
 * "navy blue", "темно-син") always beat their generic substrings ("gray",
 * "blue", "син").
 */
const BASE_COLORS: Array<[token: string, css: string, isLight: boolean]> = [
  // Apple finishes
  ["midnight", "#0f172a", false],
  ["starlight", "#f0e9e0", true],
  ["space gray", "#4a4a4d", false],
  ["space grey", "#4a4a4d", false],
  ["space black", "#1c1c1e", false],
  ["graphite", "#3a3a3c", false],
  ["product red", "#c8102e", false],
  ["lavender", "#c8b6e2", true],
  ["mint", "#b3e0cf", true],
  // English
  ["transparent", "#e5e7eb", true],
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
  ["beige", "#d9c7a7", true],
  ["brown", "#8b5e3c", false],
  ["teal", "#0d9488", false],
  ["coral", "#f88379", false],
  // Ukrainian stems (match every adjective inflection via `includes`)
  ["темно-син", "#1e3a8a", false], // navy
  ["опівнічн", "#0f172a", false], // midnight
  ["графіт", "#3a3a3c", false],
  ["сріб", "#c0c0c0", true], // срібний / сріблястий
  ["золот", "#d4af37", false], // золотий / золотистий
  ["чорн", "#1a1a1a", false],
  ["біл", "#f5f5f5", true],
  ["син", "#2563eb", false],
  ["блакитн", "#38bdf8", false], // sky blue
  ["червон", "#dc2626", false],
  ["зелен", "#16a34a", false],
  ["сір", "#9ca3af", false],
  ["рожев", "#ec4899", false],
  ["фіолетов", "#7c3aed", false],
  ["бузков", "#c8b6e2", true], // lilac ≈ lavender
  ["лаванд", "#c8b6e2", true],
  ["бежев", "#d9c7a7", true],
  ["коричнев", "#8b5e3c", false],
  ["оранжев", "#f97316", false],
  ["помаранчев", "#f97316", false],
  ["жовт", "#eab308", false],
  ["бірюзов", "#0d9488", false],
  ["м'ятн", "#b3e0cf", true],
  ["мятн", "#b3e0cf", true],
  ["прозор", "#e5e7eb", true], // transparent
];

/** Longest token first, so the most specific token wins `includes` matching. */
const BY_LENGTH = [...BASE_COLORS].sort((a, b) => b[0].length - a[0].length);

const EXACT: ReadonlyMap<string, ColorSwatch> = new Map(
  BASE_COLORS.map(([token, css, isLight]) => [token, { css, isLight }]),
);

/**
 * Resolve a colour value to a renderable swatch. Never throws; unknown values
 * resolve to a neutral gradient so the swatch always renders — and never lies
 * about the actual colour.
 */
export function colorSwatch(value: string): ColorSwatch {
  const key = value.trim().toLowerCase();

  const exact = EXACT.get(key);
  if (exact) {
    return exact;
  }

  for (const [token, css, isLight] of BY_LENGTH) {
    if (key.includes(token)) {
      return { css, isLight };
    }
  }

  return UNKNOWN_SWATCH;
}
