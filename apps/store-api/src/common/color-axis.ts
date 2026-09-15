/**
 * Colour as a CROSS-CUTTING FACET — the one vocabulary the server shares
 * between the two systems that both describe a product's colour (TASK-487,
 * owner decision B-10).
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Colour lives in TWO unrelated places in this schema:
 *
 *   1. `Product.attributes` — the free-form JSON that carries a position's
 *      VARIANT AXIS values, keyed by the axis NAME. The seed writes «Колір»,
 *      the xlsx import writes `color`, and an admin may type anything.
 *   2. `ProductAttributeValue` — the structured spec system, bound to an
 *      `AttributeDefinition` with a latin `key`. This is the ONLY thing the
 *      facet machinery can see: `?specs=color:…` and
 *      `GET /categories/:id/filterable-specs` both read it.
 *
 * Until TASK-487 nothing wrote (1) into (2), so the strongest facet in
 * accessories was invisible to every filter. {@link COLOR_SPEC_KEY} is the
 * bridge's destination key and {@link COLOR_AXIS_KEYS} its source vocabulary.
 *
 * ── Why a SET of axis names ─────────────────────────────────────────────────
 * Axis names are free-text admin data, so the same axis is spelled differently
 * depending on who authored the group. This list used to be copy-pasted into
 * `product-variant-summary.entity.ts` with a comment begging future editors to
 * keep the copies in sync; they did not, and colour dots silently vanished from
 * every product card once already (plan 170, TASK-364). One export now, and the
 * entity imports it.
 *
 * The storefront keeps its own copy in
 * `apps/store-client/src/shared/lib/color-axis.ts` — a workspace boundary, not
 * an oversight: nothing is shared between the Nest app and the Next app at
 * build time. That file cross-references this one; the two lists must agree.
 */

/**
 * The structured-spec `key` colour is filed under. Latin, like every other spec
 * key, because it is half of a URL parameter (`?specs=color:Чорний`) and of the
 * `(categoryId, key)` unique index — see `attributes.data.ts`.
 */
export const COLOR_SPEC_KEY = 'color';

/** Ukrainian label for the colour spec — the only half a shopper ever reads. */
export const COLOR_SPEC_LABEL = 'Колір';

/**
 * Axis names (compared case-insensitively, trimmed) that hold a position's
 * colour. Keep in sync with the storefront copy named in the module doc.
 */
export const COLOR_AXIS_KEYS: ReadonlySet<string> = new Set(['color', 'colour', 'колір']);

/** Whether an axis NAME denotes the colour axis. Never throws. */
export function isColorAxis(name: string): boolean {
  return COLOR_AXIS_KEYS.has(name.trim().toLowerCase());
}

/** A colour found on a position: the axis it was stored under, and its value. */
export interface ColorAxisHit {
  /** The axis name EXACTLY as stored — writes must not rename it. */
  axis: string;
  value: string;
}

/**
 * Read the colour axis off a position's `attributes` JSON.
 *
 * Returns `null` when there is no colour axis, the value is not a string, or
 * the string is blank — a blank colour is not a colour, and letting `''` reach
 * the facet would publish an unclickable empty swatch.
 *
 * The axis NAME comes back alongside the value because every write path has to
 * put the value back under the key it found it at: renaming «Колір» to `color`
 * on save would desync the position from its group's declared axis, and the PDP
 * variant navigator prints the axis name raw.
 */
export function readColorAxis(attributes: unknown): ColorAxisHit | null {
  if (attributes == null || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null;
  }
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    if (isColorAxis(key) && typeof value === 'string' && value.trim() !== '') {
      return { axis: key, value };
    }
  }
  return null;
}

/**
 * Produce the `attributes` JSON a position should carry after its colour is set
 * to `value` (or cleared with `null`).
 *
 * Key resolution, in order:
 *   1. the axis the position ALREADY stores its colour under (never renamed);
 *   2. `preferredAxis` — the colour axis declared by the position's variant
 *      group, so a bulk edit files the value under the name the group's other
 *      positions use and the PDP navigator keeps matching siblings;
 *   3. {@link COLOR_SPEC_LABEL} («Колір»), the seed's own spelling.
 *
 * Clearing removes EVERY colour-ish key, not just the first: a row that somehow
 * carries both `color` and «Колір» must not be left half-cleared, still
 * advertising a colour the operator believed they had removed.
 */
export function withColorAxis(
  attributes: unknown,
  value: string | null,
  preferredAxis?: string | null,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    attributes != null && typeof attributes === 'object' && !Array.isArray(attributes)
      ? { ...(attributes as Record<string, unknown>) }
      : {};

  const existingAxis = readColorAxis(base)?.axis ?? null;

  for (const key of Object.keys(base)) {
    if (isColorAxis(key)) {
      delete base[key];
    }
  }

  if (value === null || value.trim() === '') {
    return base;
  }

  const axis =
    existingAxis ??
    (preferredAxis && isColorAxis(preferredAxis) ? preferredAxis : null) ??
    COLOR_SPEC_LABEL;

  base[axis] = value.trim();
  return base;
}
