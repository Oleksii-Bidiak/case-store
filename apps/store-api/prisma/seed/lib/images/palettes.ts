import { hashStr } from '../ids';

/**
 * The frozen palette vocabulary for seed images (plan 170, TASK-363/365). The
 * twelve ids are a closed contract — catalogue data is authored against them —
 * and TASK-365 gives each one real colours below.
 */
export type PaletteId =
  | 'indigo'
  | 'sky'
  | 'amber'
  | 'emerald'
  | 'fuchsia'
  | 'orange'
  | 'violet'
  | 'teal'
  | 'blue'
  | 'rose'
  | 'lime'
  | 'slate';

export const PALETTE_IDS: readonly PaletteId[] = [
  'indigo',
  'sky',
  'amber',
  'emerald',
  'fuchsia',
  'orange',
  'violet',
  'teal',
  'blue',
  'rose',
  'lime',
  'slate',
];

/** One colourway: a two-stop background gradient plus the icon stroke colour. */
export interface Palette {
  /** Gradient start (the lighter stop). */
  from: string;
  /** Gradient end (the darker stop). */
  to: string;
  /** Icon stroke — a near-white tinted with the palette's own hue. */
  fg: string;
}

/**
 * Twelve colourways, sRGB hex.
 *
 * **Why hex and not oklch.** The storefront's fallback tiles build their cover
 * from `categoryGradient()` (`store-client/src/widgets/categories/model/category-visuals.ts`),
 * which emits `oklch(...)`. These colours go into an SVG that `sharp` rasterises,
 * and its SVG renderer does not resolve `oklch()` — an unparsed colour renders as
 * black, silently. So every value here is a pre-converted sRGB hex.
 *
 * **Why they still feel like the same system.** The construction is copied from
 * `categoryGradient()` verbatim: a two-stop ramp from `oklch(0.70 0.16 H)` to
 * `oklch(0.55 0.19 H)`, only the hue changes between palettes. Converted to sRGB
 * (and chroma-clamped into gamut where the hue needed it), that is exactly what
 * the fallback tile paints, so a seeded tile and a fallback tile sit next to each
 * other without a visible seam.
 *
 * **Why the hues are not `GRADIENT_HUES` index-for-index.** They cannot be: the
 * storefront cycles hues by tile *index* and never names them, while these ids
 * are names. Reusing the list positionally would have made `sky` cyan-green
 * (oklch hue 200), `slate` khaki (hue 90) and `rose` purple (hue 305) — a
 * palette whose name lies is a trap for whoever authors catalogue data next. The
 * hues below are the oklch hue of the matching Tailwind ..-500 token instead, so
 * `amber` is amber. `slate` additionally drops chroma to ~0.04, because a
 * neutral is the one thing a fixed-chroma ramp cannot express.
 */
export const PALETTES: Record<PaletteId, Palette> = {
  indigo: { from: '#8792fe', to: '#5a5edd', fg: '#f9faff' }, // oklch hue 277
  sky: { from: '#07ace7', to: '#097ca6', fg: '#f5fbff' }, // 232
  amber: { from: '#d98b05', to: '#9c6307', fg: '#fff9f3' }, // 70
  emerald: { from: '#12bb81', to: '#05865c', fg: '#f0fef6' }, // 162
  fuchsia: { from: '#cc79d9', to: '#a240b2', fg: '#fef8ff' }, // 322
  orange: { from: '#ec7a3b', to: '#b64e00', fg: '#fff9f6' }, // 47
  violet: { from: '#a388f8', to: '#7952d4', fg: '#faf9ff' }, // 293
  teal: { from: '#12b7a4', to: '#058476', fg: '#eefefb' }, // 182
  blue: { from: '#679cff', to: '#2d69de', fg: '#f7faff' }, // 262
  rose: { from: '#f16f7c', to: '#c82c4a', fg: '#fff8f8' }, // 16
  lime: { from: '#7db138', to: '#548105', fg: '#f6fdf0' }, // 130
  slate: { from: '#91a0b5', to: '#61738c', fg: '#f8fafe' }, // 257, chroma ~0.04
};

/** Deterministic palette choice — the same key always yields the same palette. */
export function pickPalette(key: string): PaletteId {
  return PALETTE_IDS[hashStr(key) % PALETTE_IDS.length];
}
