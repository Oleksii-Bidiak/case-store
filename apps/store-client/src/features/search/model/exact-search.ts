// «Шукати точно» (TASK-2069, Д3-2 §3.2): the shopper turns model recognition
// off for one query. The switch rides the URL (`?exact=1`), not component
// state, so every part of `/search` reads the same answer — the model row,
// the fix line and the results' fit marks — and a reload keeps it.

/** The URL flag of the exact mode. */
export const EXACT_SEARCH_PARAM = "exact";

/** Anything with a `get` — `URLSearchParams` or Next's read-only params. */
interface ParamReader {
  get(name: string): string | null;
}

/** `true` when the URL asks for the query as typed, no model guessing. */
export function isExactSearch(params: ParamReader): boolean {
  return params.get(EXACT_SEARCH_PARAM) === "1";
}

/**
 * The same results in exact mode. The other filters stay; the category and
 * the page are dropped — the category may have been picked for the guessed
 * model, and the result set changes, so page 3 may not exist any more.
 */
export function exactSearchHref(
  query: string,
  current?: { toString(): string },
): string {
  const next = new URLSearchParams(current?.toString() ?? "");
  next.set("q", query);
  next.delete("category");
  next.delete("page");
  next.set(EXACT_SEARCH_PARAM, "1");
  return `/search?${next.toString()}`;
}
