import type { IconId } from './icon-set';

/**
 * The drawing geometry behind {@link IconId} (plan 170, TASK-365).
 *
 * Each entry is a list of SVG child elements authored on lucide's **24×24 grid**
 * with a 2-unit stroke, so the whole set shares one optical weight and can be
 * scaled to any size by the caller. Stroke/fill/linecap are NOT set here — the
 * renderer puts them on the wrapping `<g>`, which is what keeps every icon a
 * single-colour outline.
 *
 * **Why hand-transcribed and not `lucide-react`.** store-api must not grow a
 * frontend icon dependency just to draw demo art (plan 170 §6). Where lucide has
 * the icon (`smartphone`, `headphones`, `watch`, `speaker`, `shield-check`,
 * `cable`, `plug`, `car`, `package`) the geometry below is its path data,
 * transcribed. Where it does not (`earbuds`, `band`, `powerbank`, `case`,
 * `adapter`, `stand`, `memory-card`, `usb-drive`) the shape is composed from
 * primitives in the same idiom — same grid, same stroke width, same rounded
 * joins — so the set still reads as one family.
 *
 * These strings are emitted into an SVG document verbatim. That is safe because
 * they are static constants in this file and never touch user or catalogue data;
 * {@link iconMarkup} additionally refuses anything that is not a single
 * self-closing shape element, which turns a typo (an unclosed tag that would
 * silently swallow the rest of the document, or a stray `<` that would break the
 * rasteriser) into a loud failure at seed time.
 */
const ICON_SHAPES: Record<IconId, readonly string[]> = {
  // ── lucide: smartphone ───────────────────────────────────────────────────
  smartphone: ['<rect x="5" y="2" width="14" height="20" rx="2"/>', '<path d="M12 18h.01"/>'],

  // ── lucide: headphones ───────────────────────────────────────────────────
  headphones: [
    '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  ],

  // ── composed: a true-wireless pair — ear tip, head, stem turning inward ──
  earbuds: [
    '<circle cx="7" cy="8" r="4"/>',
    '<circle cx="7" cy="8" r="1.3"/>',
    '<path d="M7 12v5a2 2 0 0 0 2 2h1"/>',
    '<circle cx="17" cy="8" r="4"/>',
    '<circle cx="17" cy="8" r="1.3"/>',
    '<path d="M17 12v5a2 2 0 0 1-2 2h-1"/>',
  ],

  // ── lucide: watch ────────────────────────────────────────────────────────
  watch: [
    '<circle cx="12" cy="12" r="6"/>',
    '<polyline points="12 10 12 12 13 13"/>',
    '<path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/>',
    '<path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/>',
  ],

  // ── composed: a fitness band — one continuous strap, screen inset ────────
  band: [
    '<rect x="8" y="2" width="8" height="20" rx="4"/>',
    '<rect x="9.5" y="7.5" width="5" height="9" rx="2.5"/>',
  ],

  // ── lucide: speaker ──────────────────────────────────────────────────────
  speaker: [
    '<rect x="4" y="2" width="16" height="20" rx="2"/>',
    '<path d="M12 6h.01"/>',
    '<circle cx="12" cy="14" r="4"/>',
    '<path d="M12 14h.01"/>',
  ],

  // ── composed: a portrait brick with a charge bolt and a status strip ─────
  powerbank: [
    '<rect x="6" y="2" width="12" height="20" rx="2.5"/>',
    '<path d="M9 5.5h6"/>',
    '<path d="m13 8-3.5 5.5h5L11 19"/>',
  ],

  // ── composed: an open shell around a device, with a camera cutout ────────
  case: [
    '<rect x="5" y="2" width="14" height="20" rx="3"/>',
    '<rect x="7.5" y="6.5" width="9" height="13" rx="1.5"/>',
    '<circle cx="9" cy="4.5" r="1.2"/>',
  ],

  // ── lucide: shield-check ─────────────────────────────────────────────────
  shield: [
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    '<path d="m9 12 2 2 4-4"/>',
  ],

  // ── lucide: cable ────────────────────────────────────────────────────────
  cable: [
    '<path d="M4 9a2 2 0 0 1-2-2V5h6v2a2 2 0 0 1-2 2Z"/>',
    '<path d="M3 5V3"/>',
    '<path d="M7 5V3"/>',
    '<path d="M19 15V6.5a3.5 3.5 0 0 0-7 0v11a3.5 3.5 0 0 1-7 0V9"/>',
    '<path d="M17 21v-2"/>',
    '<path d="M21 21v-2"/>',
    '<path d="M22 19h-6v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z"/>',
  ],

  // ── composed: a charging pad seen from above, bolt inside ────────────────
  adapter: ['<circle cx="12" cy="12" r="9"/>', '<path d="m13 6.5-4 6h6l-4 6"/>'],

  // ── lucide: plug ─────────────────────────────────────────────────────────
  plug: [
    '<path d="M12 22v-5"/>',
    '<path d="M9 8V2"/>',
    '<path d="M15 8V2"/>',
    '<path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  ],

  // ── lucide: car ──────────────────────────────────────────────────────────
  'car-holder': [
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"/>',
    '<circle cx="7" cy="17" r="2"/>',
    '<path d="M9 17h6"/>',
    '<circle cx="17" cy="17" r="2"/>',
  ],

  // ── composed: a leaning screen on a post and base — a desk stand ─────────
  stand: [
    '<rect x="7" y="2.5" width="10" height="13" rx="2" transform="rotate(-9 12 9)"/>',
    '<path d="M12 16v4"/>',
    '<path d="M5 20h14"/>',
  ],

  // ── composed: the notched SD silhouette with contact fingers ─────────────
  'memory-card': [
    '<path d="M8 21h9a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-7L6 8v11a2 2 0 0 0 2 2z"/>',
    '<path d="M9.5 7v3"/>',
    '<path d="M12.5 7v3"/>',
    '<path d="M15.5 7v3"/>',
  ],

  // ── composed: connector, body and cap seam — a flash drive ───────────────
  'usb-drive': [
    '<rect x="3" y="9.5" width="6" height="5" rx="1"/>',
    '<rect x="9" y="6" width="12" height="12" rx="2"/>',
    '<path d="M17 6v12"/>',
  ],

  // ── lucide: package ──────────────────────────────────────────────────────
  package: [
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>',
    '<path d="M12 22V12"/>',
    '<path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/>',
    '<path d="m7.5 4.27 9 5.15"/>',
  ],
};

/** The grid every shape above is authored on; the renderer scales from this. */
export const ICON_VIEWBOX = 24;

/** Stroke width in grid units. Lucide's own default is 2; 1.6 reads better enlarged. */
export const ICON_STROKE_WIDTH = 1.6;

/** Only these self-closing shape elements may appear in {@link ICON_SHAPES}. */
const SHAPE_ELEMENT_RE = /^<(path|circle|rect|line|polyline|ellipse)\s[^<>]*\/>$/;

/**
 * The SVG children for one icon, validated. Throws on a malformed entry rather
 * than emitting a broken document — a half-written tag would either blank the
 * icon or take the rest of the SVG with it, and neither is visible in a log.
 */
export function iconMarkup(id: IconId): string {
  const shapes = ICON_SHAPES[id];
  if (!shapes) {
    throw new Error(`Seed images: no geometry for icon "${id}"`);
  }
  for (const shape of shapes) {
    if (!SHAPE_ELEMENT_RE.test(shape)) {
      throw new Error(`Seed images: icon "${id}" has a malformed shape element: ${shape}`);
    }
  }
  return shapes.join('');
}

/** Every icon id that has geometry — used by the render-everything smoke pass. */
export const ICON_IDS = Object.keys(ICON_SHAPES) as IconId[];
