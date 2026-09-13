/**
 * Client-side helpers for the structured-spec facet URL param (TASK-191,
 * multi-value since TASK-414 / owner decision B-10).
 *
 * Grammar — `?specs=material:Силікон,TPU;case-type:Накладка`:
 *   `;` separates facets, the FIRST `:` in a chunk separates the key from its
 *   values, `,` separates the values within a facet.
 *
 * Semantics: values inside one facet are OR-ed ("силікон or TPU"), facets are
 * AND-ed ("…and a case"). Enforced server-side; these helpers only build and
 * read the param.
 *
 * These mirror the API's `parseSpecFilters` exactly, including the two rules
 * that matter for links already in the wild:
 *   - the ORIGINAL single-pair form (`material:Силікон`) is still valid input,
 *     parsing to one facet with one value — bookmarks and shared links survive;
 *   - a malformed chunk is SKIPPED, never fatal, so a hand-edited URL degrades
 *     to a narrower filter instead of an error page.
 *
 * A value may contain `:` but NOT `,` or `;` — those are the separators and
 * there is no escape form (see the BACKLOG follow-up).
 */

export interface SpecFacetSelection {
  key: string;
  /** Values OR-ed within this facet. Never empty — an empty facet is dropped. */
  values: string[];
}

/**
 * Parse a `specs` param into the selected facets. Returns `[]` for missing or
 * wholly malformed input. A repeated key MERGES (the server merges too: two
 * AND-ed conditions on one spec definition can never both match).
 */
export function parseSpecParam(
  raw: string | null | undefined,
): SpecFacetSelection[] {
  if (typeof raw !== "string") return [];

  const byKey = new Map<string, string[]>();

  for (const chunk of raw.split(";")) {
    const idx = chunk.indexOf(":");
    if (idx <= 0) continue;

    const key = chunk.slice(0, idx).trim();
    if (key === "") continue;

    const values = chunk
      .slice(idx + 1)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");
    if (values.length === 0) continue;

    byKey.set(key, [...(byKey.get(key) ?? []), ...values]);
  }

  return [...byKey.entries()].map(([key, values]) => ({
    key,
    values: [...new Set(values)],
  }));
}

/**
 * Serialize facets back into the URL param, dropping empties. Returns
 * `undefined` when nothing is selected — the shape `onFilterChange` expects for
 * "remove this param" (a `""` would leave `?specs=` in the address bar).
 */
export function toSpecParam(facets: SpecFacetSelection[]): string | undefined {
  const serialized = facets
    .filter((facet) => facet.values.length > 0)
    .map((facet) => `${facet.key}:${facet.values.join(",")}`)
    .join(";");
  return serialized === "" ? undefined : serialized;
}

/** The values currently selected in one facet (empty when none). */
export function selectedSpecValues(
  facets: SpecFacetSelection[],
  key: string,
): string[] {
  return facets.find((facet) => facet.key === key)?.values ?? [];
}

/**
 * Add or remove ONE value inside ONE facet, leaving every other facet alone.
 *
 * This is the whole point of the multi-select rework: the previous control
 * rebuilt the entire param from the facet being clicked, so ticking a value in
 * the second facet silently dropped the first one's selection. Here the other
 * facets are carried through untouched.
 */
export function toggleSpecValue(
  raw: string | null | undefined,
  key: string,
  value: string,
): string | undefined {
  const facets = parseSpecParam(raw);
  const current = selectedSpecValues(facets, key);
  const nextValues = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  // Rewrite the facet IN PLACE rather than dropping and re-appending it: the
  // param is what the shopper sees in the address bar and copies into a message,
  // and re-appending would shuffle the facet order on every single tick.
  const known = facets.some((facet) => facet.key === key);
  const next = known
    ? facets.map((facet) =>
        facet.key === key ? { key, values: nextValues } : facet,
      )
    : [...facets, { key, values: nextValues }];

  return toSpecParam(next);
}

/** Remove ONE value from the param (used by the removable chips). */
export function removeSpecValue(
  raw: string | null | undefined,
  key: string,
  value: string,
): string | undefined {
  const facets = parseSpecParam(raw);
  if (!selectedSpecValues(facets, key).includes(value)) {
    return toSpecParam(facets);
  }
  return toggleSpecValue(raw, key, value);
}
