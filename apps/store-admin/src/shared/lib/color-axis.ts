/**
 * "Is this the colour axis?" for the admin panel (TASK-487).
 *
 * The third and last copy of this vocabulary, alongside
 * `apps/store-api/src/common/color-axis.ts` and
 * `apps/store-client/src/shared/lib/color-axis.ts`. The copies exist because
 * nothing is shared between the three workspaces at build time — but each of
 * them now has exactly ONE, which is the part that had gone wrong before: the
 * list used to be inlined in components, they drifted, and colour dots silently
 * vanished from every product card while the PDP still rendered swatches (plan
 * 170, TASK-364). Change one, change all three.
 *
 * The admin needs it for one job only: reading the colour a product already has
 * out of its free-form `attributes`, so the bulk colour dialog can offer the
 * colours in use instead of inviting «Чорний» and «чорний» to become two
 * different filter values.
 */

/** Axis names (case-insensitive, trimmed) that hold a position's colour. */
export const COLOR_AXIS_KEYS: ReadonlySet<string> = new Set([
  "color",
  "colour",
  "колір",
]);

/** Whether an axis NAME denotes the colour axis. Never throws. */
export function isColorAxis(name: string): boolean {
  return COLOR_AXIS_KEYS.has(name.trim().toLowerCase());
}

/**
 * Read the colour value off a product's `attributes` JSON, or `null` when it has
 * no colour axis, the value is not a string, or the string is blank.
 */
export function readColorAxis(attributes: unknown): string | null {
  if (
    attributes == null ||
    typeof attributes !== "object" ||
    Array.isArray(attributes)
  ) {
    return null;
  }
  for (const [key, value] of Object.entries(
    attributes as Record<string, unknown>,
  )) {
    if (isColorAxis(key) && typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

/**
 * Distinct colours in use among the given products, collated for Ukrainian —
 * the suggestion list the bulk colour dialog offers.
 *
 * Derived from the rows ALREADY on screen rather than from a request of its own:
 * the admin list is paginated and filtered, so the page an operator is looking
 * at is exactly the neighbourhood whose spelling they should match, and a second
 * round-trip would buy a longer list nobody scrolls.
 */
export function colorsInUse(
  products: Array<{ attributes?: unknown }>,
): string[] {
  const seen = new Set<string>();
  for (const product of products) {
    const color = readColorAxis(product.attributes);
    if (color !== null) seen.add(color);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "uk"));
}
