/**
 * Client-side helpers for the structured-spec facet URL param (TASK-191). The
 * catalog carries a single `?specs=key:value` pair (the "basic" cut — doc 099
 * §6); these mirror the server's `parseSpecFilter` split-on-first-colon rule.
 */

export interface SpecFacetSelection {
  key: string;
  value: string;
}

/** Parse a `key:value` specs param into a selection, or `undefined` if invalid. */
export function parseSpecParam(
  raw: string | null | undefined,
): SpecFacetSelection | undefined {
  if (typeof raw !== "string") return undefined;
  const idx = raw.indexOf(":");
  if (idx <= 0) return undefined;
  const key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (key === "" || value === "") return undefined;
  return { key, value };
}

/** Serialize a facet selection into the `key:value` URL param form. */
export function toSpecParam(key: string, value: string): string {
  return `${key}:${value}`;
}
