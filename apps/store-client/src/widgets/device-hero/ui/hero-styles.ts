// Class fragments shared by the homepage first block (TASK-1952).

import type { DeviceFamily } from "@/entities/device";

/**
 * Visible keyboard focus: a 2px ring-coloured outline, 2px off the control
 * (Homepage mockup). No `outline-none` base — in Tailwind v4 it sets the
 * outline style to `none`, which the focus outline would then inherit.
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/** Small uppercase label («Популярні моделі»). */
export const KICKER =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

/**
 * The block's panel: both states share the slot, radius and padding, so the
 * swap after hydration keeps the frame. 24/16 → 32 (md) → 36 (lg).
 */
export const HERO_PANEL = "grid gap-6 rounded-panel px-4 py-6 md:p-8 lg:p-9";

/**
 * Tile motion (Homepage mockup / ComponentStates): lift 2px + `shadow-lift`
 * on hover (pointer devices only — Tailwind v4 gates `hover:`), press to 99%
 * with the resting card shadow; no transform under reduced motion.
 */
export const TILE_MOTION =
  "transition-[translate,scale,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift active:scale-99 active:shadow-card motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

/**
 * Graphite primary hover: `/90` is invisible on graphite (ΔL≈1%), so the
 * pill mixes further towards the page and lifts onto the card shadow;
 * pressed, it shrinks to 98%.
 */
export const PRIMARY_PILL =
  "bg-primary text-primary-foreground transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-primary/85 hover:shadow-card active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100";

/** A pill on the family panel: quick categories, other devices. */
export const PANEL_PILL =
  "inline-flex items-center gap-2 rounded-full text-foreground transition-[background-color,box-shadow] duration-150 hover:bg-card hover:shadow-card";

/** Device type drawn on a family's icon disc (phones by default). */
export type DeviceGlyph = "phone" | "watch" | "tablet";

export function deviceGlyph(family: DeviceFamily | null): DeviceGlyph {
  if (family === "watch") return "watch";
  if (family === "ipad") return "tablet";
  return "phone";
}
