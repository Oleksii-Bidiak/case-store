/**
 * The storefront's single source of truth for "is this the colour axis / the
 * colour facet?" (TASK-487).
 *
 * ── Why the list lives here and not in the components ───────────────────────
 * It used to live in `widgets/product-detail/ui/product-sibling-navigator.tsx`
 * as a local `COLOR_AXES` constant, with a matching copy on the server. They
 * drifted: the storefront accepted `колір`, the server's copy did not, and a
 * Ukrainian-named axis rendered as swatches on the PDP while every product card
 * reported zero colours — the dots silently vanished catalogue-wide (plan 170,
 * TASK-364). Now the storefront has ONE list, in `shared/`, and two consumers
 * import it: the PDP variant navigator and the catalogue's colour facet.
 *
 * ── Why there is still a server copy ────────────────────────────────────────
 * `apps/store-api/src/common/color-axis.ts` holds the same vocabulary. That is a
 * workspace boundary, not an oversight: nothing is shared between the Nest app
 * and the Next app at build time. The two lists must agree — change one, change
 * the other.
 */

/**
 * Axis names (compared case-insensitively, trimmed) that hold a position's
 * colour. Free-text admin data, so the same axis is spelled differently
 * depending on who authored the group: the seed writes «Колір», the XLSX import
 * writes `color`.
 */
export const COLOR_AXIS_KEYS: ReadonlySet<string> = new Set([
  "color",
  "colour",
  "колір",
]);

/**
 * The structured-spec `key` the colour FACET is filed under — what
 * `?specs=color:Чорний` names and what `GET /categories/:id/filterable-specs`
 * returns for the colour control.
 *
 * Latin, and deliberately equal to one of the axis spellings above: the facet
 * key is half of a catalogue URL, and a Cyrillic one would mean percent-encoded
 * links (see the server's `attributes.data.ts`).
 */
export const COLOR_SPEC_KEY = "color";

/** Whether an axis NAME denotes the colour axis. Never throws. */
export function isColorAxis(name: string): boolean {
  return COLOR_AXIS_KEYS.has(name.trim().toLowerCase());
}
